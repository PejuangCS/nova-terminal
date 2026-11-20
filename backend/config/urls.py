import logging

from django.urls import include, path
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.db import connection


logger = logging.getLogger(__name__)


@api_view(["GET"])
def health_check(request):
    """Check that the API process can reach its configured MongoDB database."""
    try:
        connection.ensure_connection()
        connection.connection.admin.command("ping")
    except Exception:
        # Database URIs and driver errors may contain internal host details.
        # Keep the response safe and leave diagnostics in the server log.
        logger.exception("Health check could not connect to MongoDB.")
        return Response(
            {"status": "error", "database": "unavailable", "detail": "Database connection failed. Check MongoDB and the backend log."},
            status=503,
        )
    return Response({"status": "ok", "database": "connected"})


urlpatterns = [
    path("api/health/", health_check, name="health-check"),
    path("api/market/", include("apps.market.urls")),
    path("api/watchlist/", include("apps.watchlist.urls")),
    path("api/portfolio/", include("apps.portfolio.urls")),
    path("api/alerts/", include("apps.alerts.urls")),
]
