# Enefit cost graph

Local web app that pulls your hourly-resolved consumption from Enefit's self-service portal, multiplies it by the matching market price, and visualises **€ per 15 minutes** so you can see when you actually spent the most on electricity.

## Setup

1. Log in to <https://iseteenindus.enefit.ee> in a browser.
2. DevTools → Application → Cookies → `iseteenindus.enefit.ee`. Copy `ENEFITSESSION` (and optionally `FPID`).
3. Find your consumption point identifier in any consumption request URL on the Usage page (e.g. `38ZEE-00742330-T`).
4. `cp .env.example .env` and fill the values in.
5. `npm install`
6. `npm run dev` → open <http://localhost:5173>.

## How it works

- Vite serves the React frontend.
- A small Vite plugin handles `/api/usage?start=YYYY-MM-DD&end=YYYY-MM-DD` server-side, where the session cookie lives. The browser never sees the cookie.
- The plugin splits the requested range into per-day calls to `/api/v2/usage-data/consumption` (15-minute aggregation) and one call to `/api/v1/market-prices` (hourly), then merges by hour.
- Cost per 15-min interval = `kWh × €/kWh` (price forward-filled across the four intervals inside each hour).

## Notes

- If the session cookie expires you'll see "session expired — update ENEFITSESSION in .env". Just refresh the cookie value and reload.
- The market price endpoint returns hourly values; 15-minute resolution comes from the consumption side.
- Estonian DST is handled via `Intl.DateTimeFormat` with `timeZone: 'Europe/Tallinn'`.
