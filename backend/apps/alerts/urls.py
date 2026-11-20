from django.urls import path

from . import views

urlpatterns = [
    path("", views.price_alerts, name="price-alerts"),
    path("<str:alert_id>/", views.price_alert_detail, name="price-alert-detail"),
]
