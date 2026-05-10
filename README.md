# B. Gilman & Co Financial Dashboard

Next.js static export for GitHub Pages.

## Local Development

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## GitHub Pages Deployment

Every push to `main` runs `.github/workflows/deploy-pages.yml`, builds the static site, and publishes the `out` directory to GitHub Pages.

Live market data on GitHub Pages uses browser-side Alpha Vantage requests, so the Pages workflow expects `NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY` or `ALPHA_VANTAGE_API_KEY` to exist as a repository secret. SEC EDGAR data is loaded directly from public SEC endpoints.
