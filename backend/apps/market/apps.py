from django.apps import AppConfig


class MarketConfig(AppConfig):
    default_auto_field = "django_mongodb_backend.fields.ObjectIdAutoField"
    name = "apps.market"
    label = "market"
