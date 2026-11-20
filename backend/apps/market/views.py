import re

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .services import MarketDataError, get_coin_ohlc, get_top_coins


COIN_ID_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$")


@api_view(["GET"])
def coins(request):
    try:
        return Response(get_top_coins())
    except MarketDataError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


@api_view(["GET"])
def coin_ohlc(request, coin_id: str):
    if not COIN_ID_PATTERN.fullmatch(coin_id):
        return Response({"detail": "CoinGecko coin ID tidak valid."}, status=400)
    allowed_days = {1, 7, 14, 30, 90, 180, 365}
    try:
        days = int(request.query_params.get("days", "30"))
    except ValueError:
        return Response({"detail": "Parameter days harus berupa angka."}, status=400)
    if days not in allowed_days:
        return Response({"detail": "Rentang chart tidak didukung."}, status=400)
    try:
        return Response(get_coin_ohlc(coin_id, days))
    except MarketDataError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
