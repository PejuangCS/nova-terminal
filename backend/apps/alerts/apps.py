from django.apps import AppConfig


class AlertsConfig(AppConfig):
    default_auto_field = "django_mongodb_backend.fields.ObjectIdAutoField"
    name = "apps.alerts"
    label = "alerts"
    verbose_name = "Price Alerts"
