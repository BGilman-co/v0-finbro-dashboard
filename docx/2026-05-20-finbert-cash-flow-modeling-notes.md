# FinBERT Cash Flow Modeling Notes

Date: 2026-05-20

## Source Material

- `/Users/blakegilman/Desktop/SSRN-id1411129.pdf`: Forecasting Financial Statements with No Plugs and No Circularity.
- `/Users/blakegilman/Desktop/5039433.pdf`: Projecting Financial Statements with Chained Machine Learning.
- `/Users/blakegilman/Desktop/Machine-Learning-Based-Financial-Statement-Analysis.pdf`: Machine Learning-Based Financial Statement Analysis.
- `ProsusAI/finBERT`: financial sentiment model exposed on Hugging Face as `ProsusAI/finbert`.

## Modeling Decisions Added

- Use ProsusAI/finBERT for management-tone sentiment when Finnhub transcript text is available.
- Keep all sentiment inference server-side through Hugging Face credentials; never expose the token to browser code.
- Treat sentiment as soft information. It may adjust near-term revenue growth and operating margin inside a small cap, but explicit SEC numbers, management guidance, and articulation checks override it.
- Keep the forecast chain ordered: revenue first, operating cost and working capital next, investing/capex next, financing/debt and interest next, then tax, distributions, and validation checks.
- Do not use a balance-sheet plug. Cash, debt, and equity should be produced by cash-flow schedules and roll-forwards, then checked.

## PDF Takeaways

- Velez-Pareja argues that plugs can hide modeling mistakes because the balance sheet can appear balanced even when underlying line items are wrong. The model should instead use explicit cash budget, debt schedule, interest, and balance checks.
- The chained ML paper finds better statement coherence when downstream line items condition on upstream forecasts. For this app, that means notes should explain dependencies such as revenue to COGS, revenue to receivables/working capital, debt to interest, pretax income to tax, and cash flow to ending cash.
- The chained ML paper also treats large deviations from expected statement structure as a warning signal. The app's validation section should preserve variance checks and eventually add structural-deviation flags when live company-specific history is available.
- The ML financial statement analysis paper finds that important predictors cluster around free-cash-flow drivers: earnings, working capital, capex, cash flows, dividends, accruals, asset growth, and recent quarter/year comparisons.

## Cash Flow Note Standard

Each forecast note should say:

- Driver: the upstream variable or evidence that moved the line.
- Formula: the exact arithmetic relation or bounded overlay.
- Evidence: SEC filing, Finnhub event/transcript, consensus check, or FinBERT tone source.
- Articulation: whether the line is directly forecast or derived from another projected line.
- Check: which validation row would catch a broken link.
- Override rule: explicit filing/guidance beats sentiment; sentiment only nudges near-term drivers.

## Implementation Status

- Added `lib/financial-sentiment.ts` for ProsusAI/finBERT inference.
- Added FinBERT sentiment to `/api/earnings/[symbol]` payloads.
- Added a FinBERT sentiment assumption row and bounded overlay to the cash-flow model.
- Updated the cash-flow model UI and export notes to include sentiment output.
- Updated README and environment examples for `HUGGING_FACE_API_KEY`.

## Next Steps

- Replace the Netflix preview history with ticker-specific SEC XBRL normalization.
- Add account-level working-capital drivers: receivables days, inventory days, payables days, deferred revenue, and accrued expenses where available.
- Add structural-deviation scores once enough company-specific historical statement vectors are available.
- Add tests for the no-plug cash roll-forward, debt-interest sequencing, and sentiment overlay caps.
