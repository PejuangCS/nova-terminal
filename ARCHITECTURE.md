# Architecture

Nova Terminal is a local single-user app split into a React frontend and a Django JSON API.

```text
Browser (React + TypeScript + Lightweight Charts)
  | same-origin /api requests through Vite dev proxy
  v
Django REST Framework
  |-- Market app ------> CoinGecko Demo REST API
  |       |              (periodic refresh; provider key stays server-side)
  |       v
  |    CoinSnapshot collection
  |    Django local-memory cache for chart responses
  |
  |-- Watchlist app ---> watchlist collection
  |-- Portfolio app ---> portfolio transaction collection
  |-- Alerts app ------> price alert collection
  |
  v
MongoDB Server (local)
```

## Data ownership

- CoinGecko is the external source for market quotes and historical chart series.
- Django owns provider API calls, request validation, cache behavior, and database writes.
- MongoDB stores the latest market snapshot and application records (watchlist, portfolio transactions, alerts).
- Technical indicator values are calculated in the browser from loaded OHLC close prices.
- Indicator preferences and chart drawings are browser-local LocalStorage data, partitioned by asset where appropriate.

## Refresh and freshness

- Market snapshot refresh is controlled by `MARKET_REFRESH_SECONDS` (default 600 seconds).
- Chart cache expiry is controlled by `CHART_CACHE_SECONDS` (default 600 seconds).
- The browser polls local market/alert endpoints; this is not a provider streaming subscription.
- Price alerts evaluate only fresh persisted market snapshots and are one-shot.

## Local security boundary

The project intentionally has no login/auth layer. API permissions are open for the local application. Vite and Django should remain bound to `127.0.0.1`. Do not expose the API to a LAN or public internet until authentication, authorization, deployment settings, rate limiting, and operational monitoring have been designed and reviewed.
