Deploying to Vercel (automatic via GitHub Actions)

This repository contains a GitHub Actions workflow at `.github/workflows/deploy-vercel.yml` that will attempt to deploy the project to Vercel on every push to `main`.

To make the workflow run successfully you must add the following GitHub repository secrets (Settings → Secrets → Actions):

- VERCEL_TOKEN — Your Vercel personal token. Create one in https://vercel.com/account/tokens
- VERCEL_ORG_ID — Your Vercel organization id (available in project settings or the dashboard)
- VERCEL_PROJECT_ID — Your Vercel project id (available in project settings)

Notes:
- If you already connected this GitHub repo in the Vercel dashboard, you may not need the above secrets: Vercel already auto-deploys on push when the project is connected. The workflow is an alternative that uses the Vercel CLI/action.
- The app currently expects a persistent Node process and writes cache files under `./data`. On Vercel (serverless) you won't have persistent disk or scheduled cron. To host the server exactly as-is and keep disk persistence, choose a host that supports persistent processes (Render, Railway, DigitalOcean App Platform, or a VPS). If you still want to host on Vercel, read the suggestions in README for refactor options.

How the workflow works
- On push to `main`, the action checks out the repo and calls the Vercel action to deploy the current state to your Vercel project.
- If the action completes successfully, Vercel will provide a deployment URL in its dashboard and action logs.

Troubleshooting
- If a workflow run fails with authentication errors, confirm `VERCEL_TOKEN` is correct and that the token has access to your org/project.
- If your app needs persistent caching and cron jobs, consider using Render or Railway (both support persistent Node services and scheduled jobs), or refactor caches to external storage (S3, Upstash, or a small DB) and move scheduled refreshes to GitHub Actions.

If you want, I can:
- Add a second workflow to run scheduled refresh jobs (GitHub Actions cron) that call `/api/buffett?refresh=1` on the deployed site.
- Add a Dockerfile + GitHub Actions that build and push a Docker image suitable for Render/DigitalOcean.

Tell me how you'd like to proceed and I will implement it.
