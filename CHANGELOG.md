# Changelog

## [1.0.0] — First portfolio-ready release

- Consolidated the personal market terminal feature set and setup documentation.
- Added local UI screenshots for the technical-analysis workspace and market screener.
- Added GitHub Actions CI for Django checks, backend unit tests, frontend tests, and production build.
- Added a release checklist and repository publishing instructions.
- Clarified local-only security boundaries, CoinGecko data freshness, portfolio accounting rules, and alert limitations.
- Hardened Git ignore rules for local environment files and generated artifacts.

## [0.9.0] — Quality, Reliability & Security

- Period inputs now use editable drafts and commit only after blur/Enter.
- Added regression tests for indicator period bounds and MACD fast/slow consistency.
- Added frontend request timeouts and clearer connection errors.
- Prevented overlapping market and price-alert polling requests.
- Cleaned up alert toast timers on unmount.
- Improved keyboard access, focus indicators, and reduced-motion behavior.
- Added user-visible warnings when chart LocalStorage cannot be written.
- Guarded numeric formatters against non-finite values.
- Sanitized health-check error details and logged diagnostics server-side.
- Validated CoinGecko coin IDs before constructing OHLC provider paths.
- Added low-risk browser security headers and configuration validation.
- Updated documentation and repository hygiene.

## [0.8.0] — Price Alerts

- Added one-shot ABOVE/BELOW price alerts.
- Added MongoDB persistence, triggered/paused states, re-arm, and optional browser notifications.

## [0.7.0] — Portfolio Tracker

- Added manual BUY/SELL transaction ledger.
- Added weighted-average cost, fee treatment, realized/unrealized P&L, holdings, and history.

## [0.6.0] — Market Screener

- Added market search, filters, presets, and sorting for the Top-100 market snapshot.

## [0.5.0] — Drawing Tools

- Added trendline and horizontal-line annotations stored per asset in browser LocalStorage.

## [0.4.0] — Technical Analysis

- Added EMA, SMA, RSI, and MACD indicators with configurable periods.

## [0.3.0] — Chart Enhancement

- Added chart crosshair OHLC details, volume observations, zoom, pan, and reset view.

## [0.2.0] — Watchlist

- Added a dedicated Watchlist page backed by MongoDB.

## [0.1.0] — Initial Dashboard

- Added Django, React, CoinGecko market data, Top-100 overview, and interactive chart foundation.
