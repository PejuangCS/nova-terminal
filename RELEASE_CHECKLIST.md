# v1.0.0 Release Checklist

Use this checklist before making the repository public or creating the `v1.0.0` GitHub release.

## Local verification

- [ ] `python manage.py check` passes from `backend/`.
- [ ] Portfolio unit tests pass.
- [ ] Price-alert unit tests pass.
- [ ] `npm ci` completes from `frontend/`.
- [ ] `npm test` passes.
- [ ] `npm run build` completes successfully.
- [ ] Manual smoke test: Overview, Markets, Watchlist, chart types/timeframes, indicators, drawing tools, Portfolio, and Price Alerts.
- [ ] Existing MongoDB records remain present after migrations.

## Secret and repository hygiene

- [ ] `.env` contains only local values and is not tracked by Git.
- [ ] `.env.example` contains placeholders only.
- [ ] No CoinGecko API key, Django secret, password, database export, or personal data appears in source or screenshots.
- [ ] `.venv/`, `node_modules/`, `dist/`, `__pycache__/`, and `*.pyc` are not committed.
- [ ] `package-lock.json` and `backend/requirements.txt` are committed.
- [ ] Run `npm audit` and review current advisories; do not apply `npm audit fix --force` blindly.
- [ ] Review Python dependency advisories before publishing.

Useful PowerShell checks from the repository root:

```powershell
git status --short
git check-ignore .env
git ls-files .env
```

`git ls-files .env` should return no path. If `.env` was previously committed, remove it from the Git index with `git rm --cached .env` and rotate any secret it contained.

## Public-repository decisions

- [ ] Choose a license before granting reuse rights. No license is included by default.
- [ ] Review CoinGecko's current API terms and attribution requirements for your intended distribution.
- [ ] Keep the app bound to localhost. Do not publicly deploy without authentication, authorization, rate limiting, HTTPS, and deployment hardening.
- [ ] Confirm screenshots do not disclose private information.

## Suggested Git release commands

Run from the repository root after all checks pass:

```powershell
git init
git add -A
git status --short
git commit -m "release: Nova Terminal v1.0.0"
git branch -M main
git tag -a v1.0.0 -m "Nova Terminal v1.0.0"
```

Create an empty GitHub repository, then connect it (replace the URL with your repository URL):

```powershell
git remote add origin https://github.com/YOUR_USERNAME/nova-terminal.git
git push -u origin main
git push origin v1.0.0
```

If the Git repository already exists, do not run `git init` or add a second `origin`; inspect `git remote -v` and use the existing remote.
