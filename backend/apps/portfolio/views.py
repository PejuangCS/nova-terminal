from decimal import Decimal, InvalidOperation

from bson import ObjectId
from bson.errors import InvalidId
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import PortfolioTransaction
from .services import build_portfolio_payload, validate_sell_balances, validate_transaction_deletion


REQUIRED_TEXT_FIELDS = ("coin_id", "name", "symbol")
DECIMAL_FIELDS = ("quantity", "price", "fee")


def _parse_decimal(value, field_name: str, *, allow_zero: bool = False) -> Decimal:
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f"Field {field_name} harus berupa angka yang valid.")
    if not parsed.is_finite():
        raise ValueError(f"Field {field_name} harus berupa angka yang valid.")
    if allow_zero:
        if parsed < 0:
            raise ValueError(f"Field {field_name} tidak boleh negatif.")
    elif parsed <= 0:
        raise ValueError(f"Field {field_name} harus lebih besar dari 0.")
    if max(0, -parsed.as_tuple().exponent) > 12:
        raise ValueError(f"Field {field_name} maksimal memiliki 12 angka desimal.")
    digits = parsed.as_tuple().digits
    exponent = parsed.as_tuple().exponent
    whole_digits = max(parsed.adjusted() + 1, 0) if parsed != 0 else 1
    precision_digits = len(digits) + max(exponent, 0)
    if len(digits) > 30 or whole_digits > 18 or precision_digits > 30:
        raise ValueError(f"Field {field_name} terlalu besar.")
    return parsed


def _prepare_transaction(data, *, existing=None) -> dict:
    def value_for(key, fallback=""):
        if key in data:
            return data.get(key)
        if existing is not None:
            return getattr(existing, key)
        return fallback

    result = {}
    for field in REQUIRED_TEXT_FIELDS:
        value = str(value_for(field, "") or "").strip()
        if not value:
            raise ValueError(f"Field {field} wajib diisi.")
        max_length = {"coin_id": 100, "name": 120, "symbol": 24}[field]
        if len(value) > max_length:
            raise ValueError(f"Field {field} terlalu panjang.")
        result[field] = value

    result["symbol"] = result["symbol"].lower()
    result["image"] = str(value_for("image", "") or "").strip()[:500]
    if "type" in data:
        raw_type = data.get("type")
    elif "transaction_type" in data:
        raw_type = data.get("transaction_type")
    elif existing is not None:
        raw_type = existing.transaction_type
    else:
        raw_type = "BUY"
    transaction_type = str(raw_type or "").upper()
    if transaction_type not in (PortfolioTransaction.BUY, PortfolioTransaction.SELL):
        raise ValueError("Jenis transaksi harus BUY atau SELL.")
    result["transaction_type"] = transaction_type

    for field in DECIMAL_FIELDS:
        fallback = "0" if field == "fee" else None
        raw = value_for(field, fallback)
        if raw is None or str(raw).strip() == "":
            raise ValueError(f"Field {field} wajib diisi.")
        result[field] = _parse_decimal(raw, field, allow_zero=(field == "fee"))

    currency = str(value_for("currency", "USD") or "USD").upper()
    if currency != "USD":
        raise ValueError("Versi awal Portfolio hanya mendukung transaksi dalam USD.")
    if transaction_type == PortfolioTransaction.SELL and result["fee"] > result["quantity"] * result["price"]:
        raise ValueError("Fee SELL tidak boleh melebihi nilai bruto transaksi.")
    result["currency"] = "USD"
    result["notes"] = str(value_for("notes", "") or "").strip()[:300]

    raw_date = value_for("executed_at", None)
    if raw_date:
        executed_at = parse_datetime(str(raw_date))
        if executed_at is None:
            raise ValueError("Tanggal transaksi tidak valid.")
        if timezone.is_naive(executed_at):
            executed_at = timezone.make_aware(executed_at, timezone.get_current_timezone())
    elif existing is not None:
        executed_at = existing.executed_at
    else:
        executed_at = timezone.now()
    result["executed_at"] = executed_at
    return result


def _find_transaction(transaction_id: str):
    try:
        object_id = ObjectId(transaction_id)
    except (InvalidId, TypeError):
        return None
    try:
        return PortfolioTransaction.objects.get(pk=object_id)
    except PortfolioTransaction.DoesNotExist:
        return None


def _save_error(exc: Exception):
    return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET"])
def portfolio_overview(request):
    return Response(build_portfolio_payload())


@api_view(["POST"])
def create_transaction(request):
    try:
        values = _prepare_transaction(request.data)
        candidate = PortfolioTransaction(**values)
        candidate.created_at = timezone.now()
        validate_sell_balances(candidate)
        candidate.save()
    except (ValueError, InvalidOperation) as exc:
        return _save_error(exc)
    return Response(build_portfolio_payload(), status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
def transaction_detail(request, transaction_id: str):
    transaction = _find_transaction(transaction_id)
    if transaction is None:
        return Response({"detail": "Transaksi tidak ditemukan."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        try:
            validate_transaction_deletion(transaction)
        except ValueError as exc:
            return _save_error(exc)
        transaction.delete()
        return Response(build_portfolio_payload(), status=status.HTTP_200_OK)

    try:
        values = _prepare_transaction(request.data, existing=transaction)
        candidate = PortfolioTransaction(**values)
        candidate.pk = transaction.pk
        candidate.created_at = transaction.created_at
        validate_sell_balances(candidate, replacing_id=str(transaction.pk))
        for key, value in values.items():
            setattr(transaction, key, value)
        transaction.save()
    except (ValueError, InvalidOperation) as exc:
        return _save_error(exc)
    return Response(build_portfolio_payload())
