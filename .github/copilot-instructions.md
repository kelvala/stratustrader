# GitHub Copilot Instructions for `stratustrader`

## Big picture
- Single-page stock analysis UI in `public/index.html` using Plotly and plain browser JS (no bundler/framework).
- Production on Vercel: static assets from `public/`, serverless API routes from `api/` (Edge runtime); `vercel.json` only tweaks headers.
- Local dev: `server.js` (Express) serves `public/` and mirrors API routes plus extra cron-driven endpoints and disk caches in `data/`.
- Market data is **Yahoo Finance only** (plus Nasdaq Trader for symbol lists and a couple of HTML pages for the Buffett indicator) – do not introduce other data providers.

## Local dev & workflows
- Use Node >=18. Core commands:
  - `npm start` → run `server.js` at `http://localhost:3000` for static + proxy APIs.
  - `npm run symbols` → update `public/stock_data.csv` via `scripts/fetch-all-symbols.mjs` (symbol|name CSV, pipe-delimited).
  - `node --experimental-fetch scripts/compute-breadth.mjs` → compute `public/breadth.json` used by the market breadth gauges.
- GitHub Actions:
  - `.github/workflows/deploy-vercel.yml` deploys `main` to Vercel (uses `npm ci` if `package.json` exists).
  - `.github/workflows/breadth-scan.yml` runs `compute-breadth.mjs` on a schedule and commits updated `public/breadth.json` via an auto-PR.

## Backend / API conventions
- Vercel functions in `api/` are small, stateless Edge handlers:
  - Pattern: `export const config = { runtime: 'edge' }; export default async function handler(req) { ... }`.
  - `api/chart.js`, `api/quote.js`, `api/summary.js` proxy Yahoo endpoints with **at least two host fallbacks** (`query1` and `query2`) and return raw Yahoo JSON or a minimal, compatible fallback shape.
- `/api/buffett` exists both as `api/buffett.js` (on-demand, stateless scrape) and as a cached Express endpoint in `server.js` backed by `data/buffett.json`.
- When adding or modifying API routes:
  - Preserve existing response shapes expected by `fetchRows`, `refreshQuoteOnce`, `fetchBreadthAndRender`, and the Buffett/VIX mini-cards in `public/index.html`.
  - Continue using `fetch` with a realistic `User-Agent` header and Yahoo host fallbacks; handle upstream failures with `502` + small JSON `{ error: ... }` rather than throwing.
  - For new Edge routes, mirror the existing pattern of `cache-control: no-store` on JSON responses unless there is a strong reason to cache.
  - If you extend an API in `api/`, mirror the behavior in `server.js` for local dev unless there is a clear reason not to.
  - Vercel never runs `server.js`; any production scheduling should come from GitHub Actions or an external cron hitting `/api/refresh-buffett` and `/api/capture-vix-open`.

## Frontend conventions (`public/index.html`)
- The entire UI (layout, CSS, and logic) lives in this single file; keep edits surgical and reuse existing helpers instead of introducing new global patterns.
- Core state & flow:
  - `state` holds `ticker`, `range`, `interval`, `rows`, cached SMAs, symbols, etc.
  - `fetchRows(ticker, range, interval)` calls `/api/chart`, normalizes Yahoo’s `chart.result[0]`, and contains **non-trivial fallbacks** (adjclose merging, duplicate timestamp collapsing, daily→quarterly/yearly aggregation, dividend extraction). Do not simplify this logic away.
  - `buildSMAAlignedSeries()` and `renderChart()` handle precomputed SMAs (20/50/200 + custom), indicator overlays (RSI, MACD, Bollinger, Ichimoku), Auto Fib, and pre/post-market shading; new studies should plug into this chip→trace pattern rather than adding ad-hoc Plotly traces.
  - Range/interval validity is enforced via `INTRADAY_INTERVALS`, `SHORT_RANGES`, and `isValidCombo()`; if you add new ranges or intervals, update these helpers so the UI and backend stay in sync.
- Autocomplete and symbol data:
  - `loadSymbols()` reads `public/stock_data.csv` (pipe or comma delimited, `symbol|name` header optional) and adds hard-coded crypto/legacy symbols; keep this contract if you change the CSV or loaders.
- Market overview:
  - `renderAllMkt()` + `renderMktCard()` use `fetchRows` to build intraday candlestick minis for DOW/NASDAQ/S&P and feed breadth gauges; any change to `fetchRows` must keep these use cases working.

## Breadth & scheduled data
- `scripts/compute-breadth.mjs`:
  - Reads `public/stock_data.csv`, fetches 1Y daily charts from Yahoo (with limited concurrency), and writes `public/breadth.json` with `sma50` / `sma200` `{above,below,counted,abovePct,belowPct}`.
  - `fetchBreadthAndRender()` in `public/index.html` expects exactly this shape and reads `/breadth.json` directly from `public/`; keep it as a static asset rather than moving it behind an API route.
- `scripts/fetch-all-symbols.mjs`:
  - Pulls symbol lists from Nasdaq Trader, merges with existing CSV, and ensures a small set of must-have symbols (including key cryptos) using Yahoo autocomplete.
  - Keep the `symbol|name` format and de-duplication rules stable unless you also adjust `loadSymbols()`.

## Buffett & VIX specifics
- Buffett:
  - Frontend uses `fetchBuffettAuto()` → `/api/buffett` and then caches the parsed ratio in `localStorage` under `buffettIndicator`; the UI also supports a client-side "Edit Buffett" modal for manual overrides.
  - Express `server.js` adds `/api/buffett-cache`, `/api/refresh-buffett`, and cron-driven daily refresh; these read/write JSON files under `data/`. Treat `data/` as best-effort cache, not durable storage.
- VIX:
  - Frontend calls `/api/quote?ticker=%5EVIX`, feeds the result into `renderVix()`, and calculates intraday % change vs a local baseline with a tiny SVG sparkline and a qualitative action string.
  - Preserve this flow by keeping `/api/quote` compatible with both Yahoo v7 `quoteResponse` and v10 `quoteSummary.price` structures.

## Style & tooling expectations
- Do **not** introduce a frontend framework, bundler, or heavy dependencies; stick to vanilla JS, inline `<script>`/`<style>`, and small utility functions as seen in `public/index.html`.
- For new Node scripts, follow the existing patterns:
  - ESM modules (`.mjs`) with a top-level `async function main()` and an explicit `main().catch(...)`.
  - Use built-in `fetch` where available (Node >=18 with `--experimental-fetch` as in `compute-breadth.mjs`), or `node-fetch@2` in CommonJS modules like `server.js` / `api/buffett.js`.
- When in doubt, look at:
  - `public/index.html` for UI, state management, and how APIs are consumed.
  - `api/chart.js`, `api/quote.js`, `api/summary.js`, `api/buffett.js` for serverless patterns.
  - `server.js` for local Express mirrors, cron jobs, and caching behavior.
  - `scripts/compute-breadth.mjs` and `scripts/fetch-all-symbols.mjs` for batch/offline data jobs.
