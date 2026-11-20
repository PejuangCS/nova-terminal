from django.db import models


class WatchlistItem(models.Model):
    coin_id = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=120)
    symbol = models.CharField(max_length=24)
    image = models.URLField(max_length=500, blank=True)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-added_at"]

    def __str__(self) -> str:
        return f"{self.name} ({self.symbol.upper()})"
