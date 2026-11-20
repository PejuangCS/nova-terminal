from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models


class PortfolioTransaction(models.Model):
    """A manually recorded BUY/SELL transaction in the personal portfolio.

    All transaction prices and fees are stored in USD. DecimalField maps to
    MongoDB Decimal128 through Django MongoDB Backend.
    """

    BUY = "BUY"
    SELL = "SELL"
    TRANSACTION_TYPES = [(BUY, "Buy"), (SELL, "Sell")]

    coin_id = models.CharField(max_length=100, db_index=True)
    name = models.CharField(max_length=120)
    symbol = models.CharField(max_length=24)
    image = models.URLField(max_length=500, blank=True)
    transaction_type = models.CharField(max_length=4, choices=TRANSACTION_TYPES)
    quantity = models.DecimalField(
        max_digits=30,
        decimal_places=12,
        validators=[MinValueValidator(Decimal("0.000000000001"))],
    )
    price = models.DecimalField(
        max_digits=30,
        decimal_places=12,
        validators=[MinValueValidator(Decimal("0.000000000001"))],
    )
    fee = models.DecimalField(
        max_digits=30,
        decimal_places=12,
        default=Decimal("0"),
        validators=[MinValueValidator(Decimal("0"))],
    )
    currency = models.CharField(max_length=3, default="USD")
    executed_at = models.DateTimeField(db_index=True)
    notes = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-executed_at", "-created_at"]

    def __str__(self) -> str:
        return f"{self.transaction_type} {self.quantity} {self.symbol.upper()}"
