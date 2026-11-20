from django.apps import AppConfig


class WatchlistConfig(AppConfig):
    default_auto_field = "django_mongodb_backend.fields.ObjectIdAutoField"
    name = "apps.watchlist"
    label = "watchlist"
