from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from .models import WatchlistItem


def serialize(item: WatchlistItem) -> dict:
    return {
        "id": item.coin_id,
        "name": item.name,
        "symbol": item.symbol,
        "image": item.image,
        "added_at": item.added_at.isoformat(),
    }


@api_view(["GET", "POST"])
def watchlist(request):
    if request.method == "GET":
        return Response({"results": [serialize(item) for item in WatchlistItem.objects.all()]})

    coin_id = str(request.data.get("id", "")).strip()
    name = str(request.data.get("name", "")).strip()
    symbol = str(request.data.get("symbol", "")).strip().lower()
    image = str(request.data.get("image", "")).strip()
    if not coin_id or not name or not symbol:
        return Response({"detail": "Field id, name, dan symbol wajib diisi."}, status=400)

    item, created = WatchlistItem.objects.update_or_create(
        coin_id=coin_id,
        defaults={"name": name, "symbol": symbol, "image": image},
    )
    return Response(serialize(item), status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@api_view(["DELETE"])
def remove_watchlist_item(request, coin_id: str):
    deleted, _ = WatchlistItem.objects.filter(coin_id=coin_id).delete()
    if not deleted:
        return Response({"detail": "Koin tidak ditemukan di watchlist."}, status=404)
    return Response(status=status.HTTP_204_NO_CONTENT)
