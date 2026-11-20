"""Pure portfolio accounting functions (no Django or database dependency)."""
from collections import defaultdict
from decimal import Decimal, localcontext
from typing import Any, Iterable

ZERO = Decimal("0")


def decimal_value(value: Any) -> Decimal:
    """Convert stored/API values to Decimal without a float round-trip."""
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def decimal_text(value: Decimal | None) -> str | None:
    if value is None:
        return None
    if value == ZERO:
        return "0"
    return format(value.normalize(), "f")


def calculate_ledger_states(transactions: Iterable[Any]):
    """Calculate weighted-average position state from chronological transactions.

    BUY fees are added to acquisition cost. SELL fees are deducted from net
    proceeds. The helper accepts transaction-like objects and is intentionally
    independent of Django so its accounting rules can be unit-tested directly.
    """
    states: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "quantity": ZERO,
        "average_cost": ZERO,
        "realized_pnl": ZERO,
        "name": "",
        "symbol": "",
        "image": "",
    })
    realized_by_transaction: dict[str, Decimal | None] = {}
    ordered = sorted(
        list(transactions),
        key=lambda item: (item.executed_at, item.created_at, str(item.pk)),
    )

    with localcontext() as context:
        context.prec = 40
        for transaction in ordered:
            state = states[transaction.coin_id]
            state["name"] = transaction.name
            state["symbol"] = transaction.symbol
            state["image"] = transaction.image

            quantity = decimal_value(transaction.quantity)
            price = decimal_value(transaction.price)
            fee = decimal_value(transaction.fee)

            if transaction.transaction_type == "BUY":
                old_quantity = state["quantity"]
                new_quantity = old_quantity + quantity
                total_cost = (quantity * price) + fee
                old_cost = old_quantity * state["average_cost"]
                state["average_cost"] = (old_cost + total_cost) / new_quantity
                state["quantity"] = new_quantity
                realized_by_transaction[str(transaction.pk)] = None
            else:
                proceeds = (quantity * price) - fee
                cost_of_sold_units = quantity * state["average_cost"]
                realized = proceeds - cost_of_sold_units
                state["realized_pnl"] += realized
                state["quantity"] -= quantity
                if state["quantity"] == ZERO:
                    state["average_cost"] = ZERO
                realized_by_transaction[str(transaction.pk)] = realized

    return states, realized_by_transaction
def validate_ledger_balances(transactions: Iterable[Any]) -> None:
    """Reject a chronological ledger where any SELL exceeds prior BUY units."""
    balances: dict[str, Decimal] = defaultdict(lambda: ZERO)
    ordered = sorted(
        list(transactions),
        key=lambda item: (item.executed_at, item.created_at, str(item.pk)),
    )
    for transaction in ordered:
        quantity = decimal_value(transaction.quantity)
        if transaction.transaction_type == "BUY":
            balances[transaction.coin_id] += quantity
        else:
            available = balances[transaction.coin_id]
            if quantity > available:
                raise ValueError(
                    f"SELL {quantity} {transaction.symbol.upper()} melebihi saldo tersedia "
                    f"{available}. Periksa jumlah atau tanggal transaksi."
                )
            balances[transaction.coin_id] -= quantity


