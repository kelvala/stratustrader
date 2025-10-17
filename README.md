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

---

MIT License