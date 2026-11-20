from django.apps import AppConfig


class PortfolioConfig(AppConfig):
    default_auto_field = "django_mongodb_backend.fields.ObjectIdAutoField"
    name = "apps.portfolio"
    label = "portfolio"
    verbose_name = "Portfolio"
