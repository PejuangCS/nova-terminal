# Security notes

## Intended deployment

Nova Terminal is designed for one person on a trusted local computer. It has no authentication or authorization layer. Bind Django and Vite to `127.0.0.1`; do not start the backend with `0.0.0.0` or expose its API through port forwarding.

## Secrets

- Store the CoinGecko API key and Django secret key in the untracked `.env` file.
- Commit only `.env.example` with placeholders.
- Rotate any API key that has been committed or shared accidentally.

## Reporting

For this personal repository, document reproducible security issues privately before publishing a public issue containing sensitive details.
