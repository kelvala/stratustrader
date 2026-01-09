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

### Scheduled + background jobs (GitHub Actions / Vercel)

Current workflows under `.github/workflows/`:

- `deploy-vercel.yml` — builds (via `npm ci` when `package.json` exists) and deploys `main` to Vercel.
- `breadth-scan.yml` — runs `scripts/compute-breadth.mjs` on a schedule and commits the updated `public/breadth.json` back to the repo via an auto PR + merge attempt.
- `buffett-vix-scheduler.yml` — calls your deployed `/api/refresh-buffett` and `/api/capture-vix-open` endpoints on a weekday schedule (open/close) to keep the Buffett indicator and VIX baseline fresh.

Buffett and VIX endpoints are exposed for external schedulers:

- `/api/refresh-buffett` — refreshes the persisted Buffett Indicator cache.
- `/api/capture-vix-open` — captures and persists the market-open ^VIX baseline.

Recommended pattern for production is to call those endpoints from GitHub Actions or another external scheduler (for example `buffett-vix-scheduler.yml`, which hits `SITE_URL/api/refresh-buffett` and `SITE_URL/api/capture-vix-open` with an optional `SCHEDULER_TOKEN` header). For local development you can rely on `server.js`'s in-process cron when running the Express server.

To use `buffett-vix-scheduler.yml`, set `SITE_URL` (e.g. your Vercel URL) and, if you want protection, `SCHEDULER_TOKEN` as repository secrets and configure the same `SCHEDULER_TOKEN` in your deployed environment.

---

MIT License