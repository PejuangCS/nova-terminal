from collections import defaultdict
from decimal import Decimal, localcontext
from typing import Any

from django.utils import timezone

from apps.market.models import CoinSnapshot
from .models import PortfolioTransaction
from .calculations import ZERO, calculate_ledger_states, decimal_text, decimal_value, validate_ledger_balances


def serialize_transaction(transaction: PortfolioTransaction, realized_pnl: Decimal | None = None) -> dict[str, Any]:
    quantity = decimal_value(transaction.quantity)
    price = decimal_value(transaction.price)
    fee = decimal_value(transaction.fee)
    gross = quantity * price
    cash_total = gross + fee if transaction.transaction_type == PortfolioTransaction.BUY else gross - fee
    return {
        "id": str(transaction.pk),
        "coin_id": transaction.coin_id,
        "name": transaction.name,
        "symbol": transaction.symbol,
        "image": transaction.image,
        "type": transaction.transaction_type,
        "quantity": decimal_text(quantity),
        "price": decimal_text(price),
        "fee": decimal_text(fee),
        "currency": transaction.currency,
        "executed_at": transaction.executed_at.isoformat(),
        "notes": transaction.notes,
        "cash_total": decimal_text(cash_total),
        "realized_pnl": decimal_text(realized_pnl),
        "created_at": transaction.created_at.isoformat(),
        "updated_at": transaction.updated_at.isoformat(),
    }




def build_portfolio_payload() -> dict[str, Any]:
    """Rebuild holdings and P/L from the complete transaction ledger.

    Uses weighted-average cost. Buy fees increase cost basis; sell fees reduce
    net proceeds. Recomputing from the ledger makes edits/deletes deterministic.
    """
    transactions = list(
        PortfolioTransaction.objects.all().order_by("executed_at", "created_at", "id")
    )
    coin_ids = list({transaction.coin_id for transaction in transactions})
    market_by_id = {
        coin.coin_id: coin
        for coin in CoinSnapshot.objects.filter(coin_id__in=coin_ids)
    } if coin_ids else {}

    states, realized_by_transaction = calculate_ledger_states(transactions)

    holdings: list[dict[str, Any]] = []
    total_current_value = ZERO
    total_cost_basis = ZERO
    total_unrealized_pnl = ZERO
    total_realized_pnl = sum((state["realized_pnl"] for state in states.values()), ZERO)
    unpriced_holdings = 0

    with localcontext() as context:
        context.prec = 40
        for coin_id, state in states.items():
            quantity = state["quantity"]
            if quantity <= ZERO:
                continue

            market = market_by_id.get(coin_id)
            current_price = decimal_value(market.current_price) if market and market.current_price is not None else None
            average_cost = state["average_cost"]
            cost_basis = quantity * average_cost
            current_value = quantity * current_price if current_price is not None else None
            unrealized = current_value - cost_basis if current_value is not None else None

            total_cost_basis += cost_basis
            if current_value is None or unrealized is None:
                unpriced_holdings += 1
            else:
                total_current_value += current_value
                total_unrealized_pnl += unrealized

            holdings.append({
                "coin_id": coin_id,
                "name": state["name"],
                "symbol": state["symbol"],
                "image": state["image"],
                "quantity": decimal_text(quantity),
                "average_buy_price": decimal_text(average_cost),
                "current_price": decimal_text(current_price),
                "market_value": decimal_text(current_value),
                "cost_basis": decimal_text(cost_basis),
                "unrealized_pnl": decimal_text(unrealized),
                "realized_pnl": decimal_text(state["realized_pnl"]),
                "price_change_percentage_24h": market.price_change_percentage_24h if market else None,
                "market_cap_rank": market.market_cap_rank if market else None,
                "allocation_percentage": decimal_text(
                    (current_value / total_current_value * Decimal("100"))
                    if current_value is not None and total_current_value > ZERO else ZERO
                ),
                "has_market_data": current_price is not None,
            })

    # Allocation needs the final portfolio value, so calculate it in a second pass.
    for holding in holdings:
        value = decimal_value(holding["market_value"]) if holding["market_value"] is not None else None
        holding["allocation_percentage"] = decimal_text(
            (value / total_current_value * Decimal("100"))
            if value is not None and total_current_value > ZERO else ZERO
        )

    holdings.sort(
        key=lambda item: (
            item["market_value"] is None,
            -(decimal_value(item["market_value"]) if item["market_value"] is not None else ZERO),
            item["name"].lower(),
        )
    )

    realized_total = total_realized_pnl
    total_pnl = realized_total + total_unrealized_pnl
    total_fees = sum((decimal_value(item.fee) for item in transactions), ZERO)
    recent_transactions = sorted(
        transactions,
        key=lambda item: (item.executed_at, item.created_at, str(item.pk)),
        reverse=True,
    )

    return {
        "summary": {
            "current_value": decimal_text(total_current_value),
            "cost_basis": decimal_text(total_cost_basis),
            "unrealized_pnl": decimal_text(total_unrealized_pnl),
            "realized_pnl": decimal_text(realized_total),
            "total_pnl": decimal_text(total_pnl),
            "total_fees": decimal_text(total_fees),
            "holdings_count": len(holdings),
            "transactions_count": len(transactions),
            "unpriced_holdings": unpriced_holdings,
        },
        "holdings": holdings,
        "transactions": [
            serialize_transaction(item, realized_by_transaction.get(str(item.pk)))
            for item in recent_transactions
        ],
        "currency": "USD",
        "cost_method": "weighted_average",
        "market_snapshot_note": "Market value uses the latest available local Top-100 CoinGecko snapshot. Assets outside that snapshot are shown without a current market value.",
    }


def validate_sell_balances(candidate: PortfolioTransaction, replacing_id: str | None = None) -> None:
    """Ensure no SELL in the full chronological ledger exceeds available units."""
    ledger = list(PortfolioTransaction.objects.all())
    if replacing_id:
        ledger = [item for item in ledger if str(item.pk) != replacing_id]
    ledger.append(candidate)
    validate_ledger_balances(ledger)


def validate_transaction_deletion(transaction: PortfolioTransaction) -> None:
    """Prevent deleting a BUY that would leave later SELL entries unsupported."""
    remaining = [item for item in PortfolioTransaction.objects.all() if item.pk != transaction.pk]
    validate_ledger_balances(remaining)
