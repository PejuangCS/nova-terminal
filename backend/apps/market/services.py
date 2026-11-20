from datetime import timedelta
from typing import Any

import httpx
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .models import CoinSnapshot


class MarketDataError(Exception):
    """A safe, user-displayable market-data error."""


def _coin_to_dict(coin: CoinSnapshot) -> dict[str, Any]:
    return {
        "id": coin.coin_id,
        "symbol": coin.symbol,
        "name": coin.name,
        "image": coin.image,
        "current_price": coin.current_price,
        "market_cap": coin.market_cap,
        "market_cap_rank": coin.market_cap_rank,
        "total_volume": coin.total_volume,
        "price_change_percentage_24h": coin.price_change_percentage_24h,
        "last_updated": coin.last_updated.isoformat() if coin.last_updated else None,
        "fetched_at": coin.fetched_at.isoformat(),
    }


def _cached_snapshot() -> list[CoinSnapshot]:
    return list(CoinSnapshot.objects.all().order_by("market_cap_rank", "name"))


def get_top_coins() -> dict[str, Any]:
    """Return cached Top-100 data and refresh the MongoDB snapshot when due."""
    now = timezone.now()
    existing = _cached_snapshot()
    latest_fetched_at = max((coin.fetched_at for coin in existing), default=None)
    refresh_after = timedelta(seconds=settings.MARKET_REFRESH_SECONDS)

    if existing and latest_fetched_at and now - latest_fetched_at < refresh_after:
        return {
            "results": [_coin_to_dict(coin) for coin in existing],
            "source": "mongodb_snapshot",
            "stale": False,
            "fetched_at": latest_fetched_at.isoformat(),
        }

    if not settings.COINGECKO_API_KEY:
        if existing:
            return {
                "results": [_coin_to_dict(coin) for coin in existing],
                "source": "mongodb_snapshot",
                "stale": True,
                "fetched_at": latest_fetched_at.isoformat() if latest_fetched_at else None,
                "warning": "CoinGecko API key is missing; showing the last saved snapshot.",
            }
        raise MarketDataError(
            "CoinGecko API key belum diatur. Isi COINGECKO_API_KEY di file .env."
        )

    url = f"{settings.COINGECKO_BASE_URL}/coins/markets"
    params = {
        "vs_currency": "usd",
        "order": "market_cap_desc",
        "per_page": 100,
        "page": 1,
        "sparkline": "false",
        "price_change_percentage": "24h",
    }
    headers = {"x-cg-demo-api-key": settings.COINGECKO_API_KEY}

    try:
        response = httpx.get(url, params=params, headers=headers, timeout=20)
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, list):
            raise MarketDataError("CoinGecko mengembalikan format data yang tidak dikenali.")
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        if existing:
            return {
                "results": [_coin_to_dict(coin) for coin in existing],
                "source": "mongodb_snapshot",
                "stale": True,
                "fetched_at": latest_fetched_at.isoformat() if latest_fetched_at else None,
                "warning": f"CoinGecko mengembalikan HTTP {status}; menampilkan snapshot terakhir.",
            }
        if status == 429:
            raise MarketDataError("Batas request CoinGecko tercapai. Coba lagi nanti.") from exc
        raise MarketDataError(f"CoinGecko mengembalikan HTTP {status}. Periksa API key dan kuota.") from exc
    except (httpx.HTTPError, ValueError) as exc:
        if existing:
            return {
                "results": [_coin_to_dict(coin) for coin in existing],
                "source": "mongodb_snapshot",
                "stale": True,
                "fetched_at": latest_fetched_at.isoformat() if latest_fetched_at else None,
                "warning": "CoinGecko tidak dapat dijangkau; menampilkan snapshot terakhir.",
            }
        raise MarketDataError("Tidak dapat menghubungi CoinGecko. Periksa koneksi internet.") from exc

    fetched_at = timezone.now()
    coin_ids: list[str] = []
    for item in payload:
        coin_id = str(item.get("id", "")).strip()
        if not coin_id:
            continue
        coin_ids.append(coin_id)
        CoinSnapshot.objects.update_or_create(
            coin_id=coin_id,
            defaults={
                "symbol": str(item.get("symbol", "")).lower(),
                "name": str(item.get("name", "")),
                "image": item.get("image") or "",
                "current_price": item.get("current_price"),
                "market_cap": item.get("market_cap"),
                "market_cap_rank": item.get("market_cap_rank"),
                "total_volume": item.get("total_volume"),
                "price_change_percentage_24h": item.get("price_change_percentage_24h"),
                "last_updated": parse_datetime(item.get("last_updated", "")) if item.get("last_updated") else None,
                "fetched_at": fetched_at,
            },
        )

    # Keep only the current Top-100 snapshot rather than accumulating old listings.
    if coin_ids:
        CoinSnapshot.objects.exclude(coin_id__in=coin_ids).delete()

    refreshed = _cached_snapshot()
    return {
        "results": [_coin_to_dict(coin) for coin in refreshed],
        "source": "coingecko_demo",
        "stale": False,
        "fetched_at": fetched_at.isoformat(),
    }


def _median_step(points: list[tuple[int, float]], fallback: int) -> int:
    """Estimate a series interval in seconds from sorted timestamp/value pairs."""
    if len(points) < 2:
        return fallback
    steps = sorted(
        points[index][0] - points[index - 1][0]
        for index in range(1, len(points))
        if points[index][0] > points[index - 1][0]
    )
    if not steps:
        return fallback
    middle = len(steps) // 2
    if len(steps) % 2:
        return steps[middle]
    return int((steps[middle - 1] + steps[middle]) / 2)


def _merge_volume(
    candles: list[dict[str, Any]],
    volume_rows: Any,
) -> bool:
    """Attach the nearest CoinGecko total-volume observation to each OHLC candle.

    CoinGecko OHLC and market-chart series can use different automatic
    granularities. We only attach a volume observation when it is close enough
    to the candle timestamp; missing volume remains None rather than fabricated.
    """
    points: list[tuple[int, float]] = []
    if isinstance(volume_rows, list):
        for row in volume_rows:
            if not isinstance(row, list) or len(row) < 2:
                continue
            try:
                timestamp = int(float(row[0]) // 1000)
                volume = float(row[1])
            except (TypeError, ValueError, OverflowError):
                continue
            if timestamp > 0 and volume >= 0:
                points.append((timestamp, volume))

    points.sort(key=lambda item: item[0])
    if not candles or not points:
        for candle in candles:
            candle["volume_24h"] = None
        return False

    candle_points = [(int(candle["time"]), float(candle["close"])) for candle in candles]
    candle_step = _median_step(candle_points, 86_400)
    volume_step = _median_step(points, 86_400)
    tolerance = max(candle_step, volume_step) / 2 + 120

    cursor = 0
    matched = 0
    for candle in candles:
        candle_time = int(candle["time"])
        while cursor + 1 < len(points):
            current_distance = abs(points[cursor][0] - candle_time)
            next_distance = abs(points[cursor + 1][0] - candle_time)
            if next_distance > current_distance:
                break
            cursor += 1

        volume_time, volume_value = points[cursor]
        if abs(volume_time - candle_time) <= tolerance:
            candle["volume_24h"] = volume_value
            matched += 1
        else:
            candle["volume_24h"] = None

    return matched > 0


def get_coin_ohlc(coin_id: str, days: int) -> dict[str, Any]:
    """Fetch OHLC + volume, caching the combined response for the chart UI.

    OHLC and total volume are separate CoinGecko REST resources. Volume is
    optional: a volume endpoint failure must not hide otherwise valid candles.
    """
    if not settings.COINGECKO_API_KEY:
        raise MarketDataError("Atur COINGECKO_API_KEY di file .env untuk memuat chart.")

    # Version the key so older cached OHLC-only arrays are not mistaken for OHLCV.
    cache_key = f"ohlcv-v2:{coin_id}:{days}"
    cached = cache.get(cache_key)
    if cached is not None:
        if isinstance(cached, dict):
            return {**cached, "source": "server_cache"}
        # Defensive compatibility for an older cache value.
        return {"results": cached, "source": "server_cache", "warning": "Volume data is not available in this cached response."}

    headers = {"x-cg-demo-api-key": settings.COINGECKO_API_KEY}
    ohlc_url = f"{settings.COINGECKO_BASE_URL}/coins/{coin_id}/ohlc"
    try:
        response = httpx.get(
            ohlc_url,
            params={"vs_currency": "usd", "days": days},
            headers=headers,
            timeout=20,
        )
        response.raise_for_status()
        rows = response.json()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 429:
            raise MarketDataError("Batas request CoinGecko tercapai. Tunggu sebelum memuat chart lagi.") from exc
        raise MarketDataError(f"CoinGecko chart endpoint mengembalikan HTTP {exc.response.status_code}.") from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise MarketDataError("Gagal mengambil data historis dari CoinGecko.") from exc

    if not isinstance(rows, list):
        raise MarketDataError("Format data OHLC dari CoinGecko tidak valid.")

    results = [
        {
            "time": int(row[0] // 1000),
            "open": float(row[1]),
            "high": float(row[2]),
            "low": float(row[3]),
            "close": float(row[4]),
            "volume_24h": None,
        }
        for row in rows
        if isinstance(row, list) and len(row) >= 5
    ]

    # CoinGecko's market-chart endpoint supplies historical total_volumes.
    # Keep candles usable when this secondary request fails or is unavailable.
    volume_warning = ""
    market_chart_url = f"{settings.COINGECKO_BASE_URL}/coins/{coin_id}/market_chart"
    try:
        volume_response = httpx.get(
            market_chart_url,
            params={"vs_currency": "usd", "days": days},
            headers=headers,
            timeout=20,
        )
        volume_response.raise_for_status()
        market_chart_payload = volume_response.json()
        volume_rows = market_chart_payload.get("total_volumes", []) if isinstance(market_chart_payload, dict) else []
        if not _merge_volume(results, volume_rows):
            volume_warning = "CoinGecko 24h market-volume history is unavailable for this range; OHLC candles are still shown."
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 429:
            volume_warning = "CoinGecko rate limit reached for 24h market-volume data; OHLC candles are still shown."
        else:
            volume_warning = f"24h market-volume endpoint returned HTTP {exc.response.status_code}; OHLC candles are still shown."
    except (httpx.HTTPError, ValueError):
        volume_warning = "24h market-volume data could not be loaded; OHLC candles are still shown."

    response_data = {"results": results, "warning": volume_warning}
    cache.set(cache_key, response_data, settings.CHART_CACHE_SECONDS)
    return {**response_data, "source": "coingecko_demo"}
