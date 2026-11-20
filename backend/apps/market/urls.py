from django.urls import path
from . import views

urlpatterns = [
    path("coins/", views.coins, name="market-coins"),
    path("coins/<str:coin_id>/ohlc/", views.coin_ohlc, name="coin-ohlc"),
]
