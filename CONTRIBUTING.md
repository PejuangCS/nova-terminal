# Contributing to Nova Terminal

This is a personal single-user project. Keep changes focused and preserve the local-only security model unless authentication and deployment hardening are deliberately added.

## Development checks

Backend (from `backend/` with the project virtual environment active):

```powershell
python manage.py check
python -m unittest discover -s apps/portfolio/tests -v
python -m unittest discover -s apps/alerts/tests -v
```

Frontend (from `frontend/`):

```powershell
npm test
npm run build
```

## Change guidelines

- Keep provider API keys in `.env`; never add secrets to source or screenshots.
- Prefer backend-side CoinGecko requests and reuse the existing market snapshot/cache.
- Do not invent market or volume observations when the provider does not return them.
- Keep money/accounting calculations in `Decimal` on the backend.
- Add regression tests when changing calculations or validation.
- Do not alter MongoDB collection names or migration history casually.
- Update `README.md` and `CHANGELOG.md` when behavior, setup, or release scope changes.
