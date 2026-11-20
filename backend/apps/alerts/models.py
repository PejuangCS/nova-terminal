from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models


class PriceAlert(models.Model):
    """A one-shot price rule for the latest locally cached market snapshot."""

    ABOVE = "ABOVE"
    BELOW = "BELOW"
    CONDITIONS = [(ABOVE, "Price reaches or rises above"), (BELOW, "Price reaches or falls below")]

    coin_id = models.CharField(max_length=100, db_index=True)
    name = models.CharField(max_length=120)
    symbol = models.CharField(max_length=24)
    image = models.URLField(max_length=500, blank=True)
    condition = models.CharField(max_length=5, choices=CONDITIONS)
    target_price = models.DecimalField(
        max_digits=30,
        decimal_places=12,
        validators=[MinValueValidator(Decimal("0.000000000001"))],
    )
    is_active = models.BooleanField(default=True, db_index=True)
    triggered_at = models.DateTimeField(null=True, blank=True)
    triggered_price = models.DecimalField(max_digits=30, decimal_places=12, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.symbol.upper()} {self.condition.lower()} {self.target_price}"
