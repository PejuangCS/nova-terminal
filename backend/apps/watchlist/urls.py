from django.urls import path
from . import views

urlpatterns = [
    path("", views.watchlist, name="watchlist"),
    path("<str:coin_id>/", views.remove_watchlist_item, name="watchlist-remove"),
]
