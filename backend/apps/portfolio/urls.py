from django.urls import path

from . import views

urlpatterns = [
    path("", views.portfolio_overview, name="portfolio-overview"),
    path("transactions/", views.create_transaction, name="portfolio-transactions"),
    path("transactions/<str:transaction_id>/", views.transaction_detail, name="portfolio-transaction-detail"),
]
