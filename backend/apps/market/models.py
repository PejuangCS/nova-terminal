from django.db import models


class CoinSnapshot(models.Model):
    """Latest Top-100 market snapshot; not a permanent candle-history store."""

    coin_id = models.CharField(max_length=100, unique=True)
    symbol = models.CharField(max_length=24)
    name = models.CharField(max_length=120)
    image = models.URLField(max_length=500, blank=True)
    current_price = models.FloatField(null=True, blank=True)
    market_cap = models.BigIntegerField(null=True, blank=True)
    market_cap_rank = models.PositiveIntegerField(null=True, blank=True)
    total_volume = models.BigIntegerField(null=True, blank=True)
    price_change_percentage_24h = models.FloatField(null=True, blank=True)
    last_updated = models.DateTimeField(null=True, blank=True)
    fetched_at = models.DateTimeField(db_index=True)

    class Meta:
        ordering = ["market_cap_rank", "name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.symbol.upper()})"
