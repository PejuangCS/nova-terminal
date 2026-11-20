from decimal import Decimal, InvalidOperation

from bson import ObjectId
from bson.errors import InvalidId
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.market.models import CoinSnapshot

from .models import PriceAlert
from .services import build_alerts_payload


def _parse_target_price(value) -> Decimal:
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Target price harus berupa angka yang valid.")
    if not parsed.is_finite() or parsed <= 0:
        raise ValueError("Target price harus lebih besar dari 0.")
    exponent = parsed.as_tuple().exponent
    if max(0, -exponent) > 12:
        raise ValueError("Target price maksimal memiliki 12 angka desimal.")
    whole_digits = max(parsed.adjusted() + 1, 0) if parsed != 0 else 1
    if whole_digits > 18 or len(parsed.as_tuple().digits) > 30:
        raise ValueError("Target price terlalu besar.")
    return parsed


def _find_alert(alert_id: str):
    try:
        object_id = ObjectId(alert_id)
    except (InvalidId, TypeError):
        return None
    try:
        return PriceAlert.objects.get(pk=object_id)
    except PriceAlert.DoesNotExist:
        return None


def _error(message: str, http_status=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": message}, status=http_status)


@api_view(["GET", "POST"])
def price_alerts(request):
    if request.method == "GET":
        return Response(build_alerts_payload())

    coin_id = str(request.data.get("coin_id", "")).strip()
    condition = str(request.data.get("condition", "")).upper().strip()
    if not coin_id:
        return _error("Pilih cryptocurrency terlebih dahulu.")
    if condition not in (PriceAlert.ABOVE, PriceAlert.BELOW):
        return _error("Condition harus ABOVE atau BELOW.")
    try:
        target_price = _parse_target_price(request.data.get("target_price"))
    except ValueError as exc:
        return _error(str(exc))

    coin = CoinSnapshot.objects.filter(coin_id=coin_id).first()
    if coin is None:
        return _error("Aset tidak ditemukan pada snapshot Top 100. Refresh market lalu coba lagi.")
    if coin.current_price is None:
        return _error("Harga aset belum tersedia. Coba lagi setelah market diperbarui.")

    alert = PriceAlert.objects.create(
        coin_id=coin.coin_id,
        name=coin.name,
        symbol=coin.symbol,
        image=coin.image,
        condition=condition,
        target_price=target_price,
    )
    payload = build_alerts_payload()
    return Response(payload, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
def price_alert_detail(request, alert_id: str):
    alert = _find_alert(alert_id)
    if alert is None:
        return _error("Price alert tidak ditemukan.", status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        alert.delete()
        return Response(build_alerts_payload(), status=status.HTTP_200_OK)

    changed_rule = False
    update_fields = []

    if "condition" in request.data:
        condition = str(request.data.get("condition", "")).upper().strip()
        if condition not in (PriceAlert.ABOVE, PriceAlert.BELOW):
            return _error("Condition harus ABOVE atau BELOW.")
        alert.condition = condition
        changed_rule = True
        update_fields.append("condition")

    if "target_price" in request.data:
        try:
            alert.target_price = _parse_target_price(request.data.get("target_price"))
        except ValueError as exc:
            return _error(str(exc))
        changed_rule = True
        update_fields.append("target_price")

    if changed_rule:
        # Changing a rule rearms it so the new threshold can be evaluated.
        alert.is_active = True
        alert.triggered_at = None
        alert.triggered_price = None
        update_fields.extend(["is_active", "triggered_at", "triggered_price"])

    if "is_active" in request.data and not changed_rule:
        value = request.data.get("is_active")
        if not isinstance(value, bool):
            return _error("is_active harus berupa boolean.")
        alert.is_active = value
        update_fields.append("is_active")
        if value:
            # Reactivating a triggered or paused alert starts a new one-shot rule.
            alert.triggered_at = None
            alert.triggered_price = None
            update_fields.extend(["triggered_at", "triggered_price"])

    if not update_fields:
        return _error("Tidak ada perubahan alert yang dikirim.")

    alert.save(update_fields=list(dict.fromkeys(update_fields + ["updated_at"])))
    return Response(build_alerts_payload())
