# Generated for Nova Terminal v0.8 (Django 5.2 / MongoDB Backend 5.2).
import django_mongodb_backend.fields
from decimal import Decimal
from django.core.validators import MinValueValidator
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="PriceAlert",
            fields=[
                ("id", django_mongodb_backend.fields.ObjectIdAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("coin_id", models.CharField(db_index=True, max_length=100)),
                ("name", models.CharField(max_length=120)),
                ("symbol", models.CharField(max_length=24)),
                ("image", models.URLField(blank=True, max_length=500)),
                ("condition", models.CharField(choices=[("ABOVE", "Price reaches or rises above"), ("BELOW", "Price reaches or falls below")], max_length=5)),
                ("target_price", models.DecimalField(decimal_places=12, max_digits=30, validators=[MinValueValidator(Decimal("0.000000000001"))])),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("triggered_at", models.DateTimeField(blank=True, null=True)),
                ("triggered_price", models.DecimalField(blank=True, decimal_places=12, max_digits=30, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
