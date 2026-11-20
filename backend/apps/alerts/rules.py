from decimal import Decimal


def price_matches_condition(condition: str, current_price: Decimal, target_price: Decimal) -> bool:
    """Return whether the current price satisfies a one-shot ABOVE/BELOW rule."""
    if condition == "ABOVE":
        return current_price >= target_price
    if condition == "BELOW":
        return current_price <= target_price
    raise ValueError("Kondisi alert tidak dikenal.")
