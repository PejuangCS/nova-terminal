from pathlib import Path
import os

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent
load_dotenv(PROJECT_ROOT / ".env")

DEBUG = os.getenv("DJANGO_DEBUG", "true").strip().lower() in {"1", "true", "yes", "on"}
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "").strip()
if not SECRET_KEY and DEBUG:
    SECRET_KEY = "development-only-change-me"
if not DEBUG and (
    not SECRET_KEY
    or SECRET_KEY == "development-only-change-me"
    or SECRET_KEY.startswith("replace-this")
):
    raise ImproperlyConfigured(
        "Set a unique DJANGO_SECRET_KEY before running with DJANGO_DEBUG=false."
    )
ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv("DJANGO_ALLOWED_HOSTS", "127.0.0.1,localhost").split(",")
    if host.strip()
]

# This is a single-user API. Authentication/admin are intentionally omitted from
# the first milestone; the watchlist is local to this personal installation.
INSTALLED_APPS = [
    "django_mongodb_backend",
    "rest_framework",
    "apps.market.apps.MarketConfig",
    "apps.watchlist.apps.WatchlistConfig",
    "apps.portfolio.apps.PortfolioConfig",
    "apps.alerts.apps.AlertsConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"
ASGI_APPLICATION = "config.asgi.application"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = []

DATABASES = {
    "default": {
        "ENGINE": "django_mongodb_backend",
        "HOST": os.getenv("MONGODB_URI", "mongodb://127.0.0.1:27017/"),
        "NAME": os.getenv("MONGODB_NAME", "crypto_terminal"),
        "OPTIONS": {"serverSelectionTimeoutMS": 5000},
    }
}

DEFAULT_AUTO_FIELD = "django_mongodb_backend.fields.ObjectIdAutoField"

# A local in-process cache is sufficient for a single-user local MVP.
# Redis can replace this later without changing the API contract.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "crypto-terminal-cache",
        "TIMEOUT": 600,
    }
}

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "UNAUTHENTICATED_USER": None,
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Jakarta"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"

# Low-risk browser security headers are safe for this local JSON API.
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_REFERRER_POLICY = "same-origin"


def _positive_int_env(name: str, default: int, minimum: int = 1) -> int:
    raw_value = os.getenv(name, str(default)).strip()
    try:
        parsed = int(raw_value)
    except ValueError as exc:
        raise ImproperlyConfigured(f"{name} must be an integer.") from exc
    if parsed < minimum:
        raise ImproperlyConfigured(f"{name} must be at least {minimum}.")
    return parsed


COINGECKO_API_KEY = os.getenv("COINGECKO_API_KEY", "").strip()
COINGECKO_BASE_URL = os.getenv(
    "COINGECKO_BASE_URL", "https://api.coingecko.com/api/v3"
).rstrip("/")
MARKET_REFRESH_SECONDS = _positive_int_env("MARKET_REFRESH_SECONDS", 600, minimum=60)
CHART_CACHE_SECONDS = _positive_int_env("CHART_CACHE_SECONDS", 600, minimum=60)
