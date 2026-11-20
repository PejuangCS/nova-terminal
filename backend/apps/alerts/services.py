from decimal import Decimal, InvalidOperation
from typing import Any

from django.conf import settings
from django.utils import timezone

from apps.market.models import CoinSnapshot

from .models import PriceAlert
from .rules import price_matches_condition


def _decimal_string(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return format(value, "f")


def _market_snapshot() -> tuple[dict[str, CoinSnapshot], Any, bool]:
    snapshots = list(CoinSnapshot.objects.all())
    by_id = {coin.coin_id: coin for coin in snapshots}
    latest_fetched_at = max((coin.fetched_at for coin in snapshots), default=None)
    freshness_window = max(settings.MARKET_REFRESH_SECONDS * 2, 900)
    age_seconds = (timezone.now() - latest_fetched_at).total_seconds() if latest_fetched_at else None
    is_fresh = bool(age_seconds is not None and 0 <= age_seconds <= freshness_window)
    return by_id, latest_fetched_at, is_fresh


def evaluate_active_alerts(snapshot_by_id: dict[str, CoinSnapshot], snapshot_is_fresh: bool) -> int:
    """Trigger active alerts using the latest fresh MongoDB market snapshot.

    Alerts are one-shot: once matched, the alert is deactivated and records the
    observed price. No CoinGecko request is made from this function.
    """
    if not snapshot_is_fresh:
        return 0

    triggered_count = 0
    now = timezone.now()
    for alert in PriceAlert.objects.filter(is_active=True):
        coin = snapshot_by_id.get(alert.coin_id)
        if coin is None or coin.current_price is None:
            continue
        try:
            current_price = Decimal(str(coin.current_price))
        except (InvalidOperation, TypeError, ValueError):
            continue
        if not current_price.is_finite() or current_price <= 0:
            continue
        if price_matches_condition(alert.condition, current_price, alert.target_price):
            alert.is_active = False
            alert.triggered_at = now
            alert.triggered_price = current_price
            alert.updated_at = now
            alert.save(update_fields=["is_active", "triggered_at", "triggered_price", "updated_at"])
            triggered_count += 1
    return triggered_count


def build_alerts_payload() -> dict[str, Any]:
    snapshot_by_id, latest_fetched_at, snapshot_is_fresh = _market_snapshot()
    evaluate_active_alerts(snapshot_by_id, snapshot_is_fresh)

    alerts = []
    active_count = triggered_count = paused_count = 0
    for alert in PriceAlert.objects.all():
        coin = snapshot_by_id.get(alert.coin_id)
        current_price = None
        if coin is not None and coin.current_price is not None:
            try:
                current_price = Decimal(str(coin.current_price))
            except (InvalidOperation, TypeError, ValueError):
                current_price = None

        if alert.triggered_at is not None:
            state = "triggered"
            triggered_count += 1
        elif alert.is_active:
            state = "active"
            active_count += 1
        else:
            state = "paused"
            paused_count += 1

        alerts.append({
            "id": str(alert.pk),
            "coin_id": alert.coin_id,
            "name": alert.name,
            "symbol": alert.symbol,
            "image": alert.image,
            "condition": alert.condition,
            "target_price": _decimal_string(alert.target_price),
            "current_price": _decimal_string(current_price),
            "price_available": current_price is not None,
            "price_is_fresh": snapshot_is_fresh,
            "is_active": alert.is_active,
            "status": state,
            "triggered_at": alert.triggered_at.isoformat() if alert.triggered_at else None,
            "triggered_price": _decimal_string(alert.triggered_price),
            "created_at": alert.created_at.isoformat(),
            "updated_at": alert.updated_at.isoformat(),
        })

    return {
        "results": alerts,
        "summary": {
            "total": len(alerts),
            "active": active_count,
            "triggered": triggered_count,
            "paused": paused_count,
        },
        "market_snapshot_at": latest_fetched_at.isoformat() if latest_fetched_at else None,
        "market_snapshot_fresh": snapshot_is_fresh,
        "market_refresh_seconds": settings.MARKET_REFRESH_SECONDS,
        "evaluation_mode": "latest_mongodb_snapshot",
    }
