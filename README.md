# StratusTrader

A lightweight, Yahoo-only stock analysis web UI with Plotly charts and serverless API functions.

## Live deploy (Vercel)

This repo is ready for Vercel. On push to `main`, Vercel auto-deploys:
- Static site from `public/`
- Serverless API from `api/` (edge/runtime as declared per file)

If not already linked, import the repo in Vercel and leave Build Command empty. The routing is defined in `vercel.json`.

## Local development

- Run the local Express server (for static + proxy):

```bash
npm start
```

- Open http://localhost:3000

## Deployment via CLI (optional)

```bash
npm i -g vercel
vercel login
vercel link   # choose kelvalas-projects/stratustrader
vercel --prod
```

## Data sources

- Yahoo Finance only (no other providers).
  - `/api/chart` → Yahoo chart (query1/2)
  - `/api/quote` → Yahoo v10/v7, with a fallback derived from Yahoo chart

## Notes

- `server.js` is for local dev only. Vercel uses `api/` serverless functions.
- `public/index.html` includes a long-range fallback that aggregates daily Yahoo data into Quarterly/Yearly candles and trims to the selected range.

### Scheduled refreshes (GitHub Actions / Vercel)

The repository contains a GitHub Actions workflow at `.github/workflows/scheduled-refresh.yml` which can trigger two endpoints on your deployed site:

- `/api/refresh-buffett` — refreshes the persisted Buffett Indicator cache
- `/api/capture-vix-open` — captures and persists the market-open ^VIX baseline

To use the workflow, set the repository secret `SITE_URL` to your deployed site root (for example `https://my-app.vercel.app`). Optionally set `SCHEDULER_TOKEN` (a shared secret) and export the same value into your deployment as `SCHEDULER_TOKEN` to restrict who may call the endpoints.

Notes:
- Vercel serverless functions have ephemeral execution and do not run persistent crons. The workflow above is the recommended approach for scheduled refreshes when deploying to Vercel.
- For local development you can still rely on `server.js`'s in-process cron when running the Express server.

---

MIT License