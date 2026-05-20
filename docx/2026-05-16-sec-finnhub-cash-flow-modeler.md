# SEC EDGAR + Finnhub Cash Flow Modeler Notes

## Request

Add a sidebar entry above Researcher for a model that projects historical and 5-year future company cash flows from SEC EDGAR filings and Finnhub earnings-call transcripts. Include all-stock selection, environment-based Finnhub configuration, company ticker selection, optional SEC User-Agent support, two spreadsheet-style tables, projection notes, export support, and foreign exchange line items.

## Decisions

- The repository is a Next.js dashboard, so the implementation is a web-app modeler view.
- The Finnhub key should be provided through `.env.local` as `FINNHUB_API_KEY`; the website does not ask for it.
- The exporter produces CSV plus companion JSON cell notes because the project does not currently include a Swift or Node XLSX writer with comment support.
- The screen renders exactly two spreadsheet-style financial tables: income statement and cash flow statement.
- Foreign exchange is included in both statements:
  - Income statement: `Foreign exchange gain / (loss)`.
  - Cash flow statement: `Effect of foreign exchange on cash`.

## Data Model

The typed helper defines `Company`, `Filing`, `XBRLFact`, `FinancialStatement`, `StatementLineItem`, `Transcript`, `ForecastAssumption`, and `ForecastCellNote`.

## SEC And Finnhub Evidence Plan

- CIK lookup: `https://www.sec.gov/files/company_tickers.json`
- Submissions: `https://data.sec.gov/submissions/CIK##########.json`
- Company facts: `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json`
- Finnhub transcript metadata and transcript fetches can fill the `Transcript` evidence list once a server-side secure API route or native Xcode client exists.

## Status

- Added `CASH FLOW MODEL` above `RESEARCHER` in desktop and mobile navigation.
- Added stock search, select-all, environment input guidance, ticker selection, SEC source links, two tables, projected-cell notes, and CSV/JSON export.
- Added fallback XBRL mappings for revenue, margins, interest, tax, working capital, capex, debt, leases, financing obligations, and FX.
- Rebuilt the Netflix projection helper so the income statement and cash flow statement are formula-linked, source-backed, and validated.
- Added base, upside, and downside scenarios for revenue growth, operating margin, cash-flow conversion, capex intensity, tax rate, buybacks, and share-count reduction.
- Added an assumptions table with source document, disclosure summary, assumption used, affected line item, and projection period.
- Added validation checks for balance sheet balance, cash roll-forward, net income tie, D&A tie, EPS, and working-capital bridge.
- Added a conventional projection check using public consensus-style references:
  - StockAnalysis/Finnhub: FY2026 revenue $52.46B, FY2027 revenue $58.62B, FY2026 EPS $3.66, FY2027 EPS $3.92.
  - Zacks: FY2026 revenue $51.36B, FY2027 revenue $57.44B, FY2026 EPS $3.17, FY2027 EPS $3.86.
  - S&P Global/Visible Alpha: FY2026 revenue about $51.4B and FY2027 diluted EPS $4.01.
- Base case conventional check is within the +/-10% tolerance where public consensus baselines are available:
  - Revenue: 2026E -1.3%, 2027E -2.8%.
  - Diluted EPS: 2026E -3.9%, 2027E -3.3%.
- Added Finnhub earnings calendar monitoring:
  - `/api/earnings/[symbol]` checks the selected ticker's earnings calendar and transcript metadata.
  - `/api/cron/finnhub-earnings` runs from Vercel Cron daily and checks upcoming/recent earnings releases. The cadence matches the current Vercel Hobby account limit.
  - The modeler polls the selected ticker every 30 minutes while open and displays a refresh signal when a release or recent call metadata is available.
- Added ProsusAI/finBERT sentiment:
  - `lib/financial-sentiment.ts` calls the Hugging Face hosted `ProsusAI/finbert` model with server-side credentials only.
  - Finnhub transcript text is scored as positive, negative, and neutral probabilities when transcript detail access is available.
  - The score equals positive probability minus negative probability and is exported with the forecast notes.
  - Sentiment is a bounded near-term overlay, capped at +/-75 bps of year-one revenue growth and +/-30 bps of operating margin; SEC filings and explicit guidance remain controlling.

## Modeling Skill Upgrade

The May 20 research pass added three modeling rules from the supplied PDFs:

- No plugs and no circularity: forecast cash, debt, interest, and financing from explicit schedules and cash roll-forwards instead of using cash, debt, or equity as a balancing plug.
- Chained line-item projection: forecast upstream drivers first, then condition downstream lines on them. The model order is revenue, operating costs and working capital, investing asset base and capex, financing/debt and interest, taxes, distributions, and articulated checks.
- ML-informed feature discipline: emphasize variables that repeatedly matter for free cash flow and earnings response: earnings, accruals, working-capital components, capex, cash flows, dividends/buybacks, asset growth, and one-quarter and one-year historical comparisons.

New cash-flow notes should therefore explain:

- Which upstream driver created the projected movement.
- Whether the line is directly forecast or articulated from other lines.
- Which validation check would catch a broken cash roll-forward, debt schedule, EPS tie, or balance-sheet relation.
- Whether FinBERT tone supports only a soft near-term overlay or whether explicit SEC/Finnhub guidance changes the actual driver.

## Follow-Ups

- Replace preview model values with live SEC companyfacts normalization and Finnhub transcript scanning when the refresh signal is active.
- Add an XLSX writer that preserves comments directly in Excel.
- Add formal unit tests once the repo has a test runner configured.
- Expand conventional projection checks beyond 2027 when reliable public consensus baselines are available; current free sources only support 2026E-2027E robustly.
