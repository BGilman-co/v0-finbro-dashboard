export type Company = {
  ticker: string
  name: string
  cik?: string
}

export type Filing = {
  accessionNumber: string
  form: "10-K" | "10-Q"
  fiscalYear: number
  filedAt: string
  sourceUrl: string
}

export type XBRLFact = {
  concept: string
  label: string
  value: number
  unit: string
  fiscalYear: number
  form: Filing["form"]
  filedAt: string
}

export type StatementLineItem = {
  id: string
  label: string
  historical: number[]
  projected: number[]
  formula?: string
  notes?: ForecastCellNote[]
}

export type FinancialStatement = {
  title: string
  years: number[]
  projectedYears: number[]
  lineItems: StatementLineItem[]
}

export type Transcript = {
  id: string
  ticker: string
  quarter: string
  date: string
  sourceUrl?: string
  evidence: string[]
}

export type ForecastAssumption = {
  id: string
  label: string
  value: string
  confidence: "High" | "Medium" | "Low"
  secEvidence: string
  transcriptEvidence: string
}

export type ForecastCellNote = {
  year: number
  assumption: string
  historicalSupport: string
  secEvidence: string
  transcriptEvidence: string
  confidence: ForecastAssumption["confidence"]
}

const incomeConceptFallbacks: Record<string, string[]> = {
  revenue: ["Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerExcludingAssessedTax"],
  costOfRevenue: ["CostOfRevenue", "CostOfGoodsAndServicesSold"],
  grossProfit: ["GrossProfit"],
  operatingExpense: ["OperatingExpenses", "SellingGeneralAndAdministrativeExpense", "ResearchAndDevelopmentExpense"],
  operatingIncome: ["OperatingIncomeLoss"],
  interestExpense: ["InterestExpenseNonOperating", "InterestExpense"],
  foreignExchange: ["ForeignCurrencyTransactionGainLossBeforeTax", "ForeignExchangeGainsLosses"],
  taxExpense: ["IncomeTaxExpenseBenefit"],
  netIncome: ["NetIncomeLoss", "ProfitLoss"],
}

const cashFlowConceptFallbacks: Record<string, string[]> = {
  netIncome: ["NetIncomeLoss", "ProfitLoss"],
  depreciationAmortization: ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization"],
  shareBasedCompensation: ["ShareBasedCompensation"],
  receivables: ["IncreaseDecreaseInAccountsReceivable"],
  inventory: ["IncreaseDecreaseInInventories"],
  payables: ["IncreaseDecreaseInAccountsPayable"],
  accruedExpenses: ["IncreaseDecreaseInAccruedLiabilities"],
  deferredRevenue: ["IncreaseDecreaseInContractWithCustomerLiability"],
  operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities"],
  capitalExpenditures: ["PaymentsToAcquirePropertyPlantAndEquipment"],
  debtIssuance: ["ProceedsFromIssuanceOfLongTermDebt", "ProceedsFromBorrowings"],
  debtRepayment: ["RepaymentsOfLongTermDebt", "RepaymentsOfDebt"],
  leaseFinancing: ["FinanceLeasePrincipalPayments", "OperatingLeasePayments"],
  foreignExchangeCash: ["EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
  cashChange: ["CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect"],
}

export const xbrlConceptFallbacks = {
  incomeStatement: incomeConceptFallbacks,
  cashFlowStatement: cashFlowConceptFallbacks,
}

const years = [2021, 2022, 2023, 2024, 2025]
const projectedYears = [2026, 2027, 2028, 2029, 2030]

function projectFromBase(base: number, growthRate: number) {
  return projectedYears.map((_, index) => Math.round(base * (1 + growthRate) ** (index + 1)))
}

function note(year: number, assumption: ForecastAssumption): ForecastCellNote {
  return {
    year,
    assumption: assumption.value,
    historicalSupport: "Uses the latest 3-5 fiscal years when SEC companyfacts are available; this preview uses normalized sample history until live fetch is connected.",
    secEvidence: assumption.secEvidence,
    transcriptEvidence: assumption.transcriptEvidence,
    confidence: assumption.confidence,
  }
}

function notes(assumption: ForecastAssumption) {
  return projectedYears.map((year) => note(year, assumption))
}

export function buildPreviewModel(company: Company): {
  assumptions: ForecastAssumption[]
  transcripts: Transcript[]
  filings: Filing[]
  incomeStatement: FinancialStatement
  cashFlowStatement: FinancialStatement
} {
  const revenueAssumption: ForecastAssumption = {
    id: "revenue-growth",
    label: "Revenue growth",
    value: "5.8% CAGR, adjusted for recent trend and guidance language",
    confidence: "Medium",
    secEvidence: "SEC XBRL revenue fallbacks: " + incomeConceptFallbacks.revenue.join(", "),
    transcriptEvidence: "Scans for guidance, margins, liquidity, demand, working capital, and one-time item commentary.",
  }
  const marginAssumption: ForecastAssumption = {
    id: "margin",
    label: "Margin profile",
    value: "Gross and operating margins use historical averages unless guidance overrides them",
    confidence: "Medium",
    secEvidence: "Uses gross profit, operating expense, operating income, interest expense, tax, and FX tags.",
    transcriptEvidence: "Looks for management comments about margins, interest expense, refinancing, and one-time items.",
  }
  const workingCapitalAssumption: ForecastAssumption = {
    id: "working-capital",
    label: "Working capital",
    value: "Receivables, inventory, payables, accrued expenses, and deferred revenue follow historical revenue ratios",
    confidence: "Low",
    secEvidence: "Cash-flow XBRL fallbacks include AR, inventory, AP, accrued liabilities, and deferred revenue concepts.",
    transcriptEvidence: "Raises confidence when transcripts mention working capital, inventory, receivables, payables, liquidity, or guidance.",
  }
  const capexAssumption: ForecastAssumption = {
    id: "capex",
    label: "Capex",
    value: "Capex follows historical capex/revenue unless filing or transcript evidence indicates a cycle change",
    confidence: "Medium",
    secEvidence: "Uses PaymentsToAcquirePropertyPlantAndEquipment plus lease and financing obligation tags.",
    transcriptEvidence: "Scans for capex, leases, debt maturity, refinancing, and liquidity commentary.",
  }
  const fxAssumption: ForecastAssumption = {
    id: "foreign-exchange",
    label: "Foreign exchange",
    value: "FX gains/losses and cash translation effects use historical average as a low-volatility placeholder",
    confidence: "Low",
    secEvidence: "Uses foreign currency gain/loss and effect-of-exchange-rate-on-cash XBRL fallbacks when present.",
    transcriptEvidence: "Raises confidence only when management calls out currency, FX, hedging, or translation effects.",
  }

  const assumptions = [revenueAssumption, marginAssumption, workingCapitalAssumption, capexAssumption, fxAssumption]
  const revenue = [94000, 101500, 108900, 116200, 123800]
  const projectedRevenue = projectFromBase(revenue.at(-1) ?? 123800, 0.058)
  const costOfRevenue = revenue.map((value) => Math.round(value * -0.58))
  const projectedCost = projectedRevenue.map((value) => Math.round(value * -0.575))
  const grossProfit = revenue.map((value, index) => value + costOfRevenue[index])
  const projectedGrossProfit = projectedRevenue.map((value, index) => value + projectedCost[index])
  const operatingExpense = revenue.map((value) => Math.round(value * -0.19))
  const projectedOperatingExpense = projectedRevenue.map((value) => Math.round(value * -0.185))
  const operatingIncome = grossProfit.map((value, index) => value + operatingExpense[index])
  const projectedOperatingIncome = projectedGrossProfit.map((value, index) => value + projectedOperatingExpense[index])
  const interestExpense = revenue.map((value) => Math.round(value * -0.012))
  const projectedInterestExpense = projectedRevenue.map((value) => Math.round(value * -0.011))
  const foreignExchange = [-120, 80, -210, 95, -60]
  const projectedForeignExchange = projectedYears.map(() => -40)
  const taxExpense = operatingIncome.map((value, index) => Math.round((value + interestExpense[index] + foreignExchange[index]) * -0.18))
  const projectedTaxExpense = projectedOperatingIncome.map((value, index) =>
    Math.round((value + projectedInterestExpense[index] + projectedForeignExchange[index]) * -0.19),
  )
  const netIncome = operatingIncome.map((value, index) => value + interestExpense[index] + foreignExchange[index] + taxExpense[index])
  const projectedNetIncome = projectedOperatingIncome.map(
    (value, index) => value + projectedInterestExpense[index] + projectedForeignExchange[index] + projectedTaxExpense[index],
  )

  const depreciation = revenue.map((value) => Math.round(value * 0.045))
  const projectedDepreciation = projectedRevenue.map((value) => Math.round(value * 0.044))
  const sbc = revenue.map((value) => Math.round(value * 0.032))
  const projectedSbc = projectedRevenue.map((value) => Math.round(value * 0.03))
  const receivables = revenue.map((value) => Math.round(value * -0.018))
  const projectedReceivables = projectedRevenue.map((value) => Math.round(value * -0.017))
  const inventory = revenue.map((value) => Math.round(value * -0.006))
  const projectedInventory = projectedRevenue.map((value) => Math.round(value * -0.005))
  const payables = revenue.map((value) => Math.round(value * 0.012))
  const projectedPayables = projectedRevenue.map((value) => Math.round(value * 0.011))
  const accruedExpenses = revenue.map((value) => Math.round(value * 0.009))
  const projectedAccruedExpenses = projectedRevenue.map((value) => Math.round(value * 0.009))
  const deferredRevenue = revenue.map((value) => Math.round(value * 0.004))
  const projectedDeferredRevenue = projectedRevenue.map((value) => Math.round(value * 0.004))
  const operatingCashFlow = netIncome.map(
    (value, index) => value + depreciation[index] + sbc[index] + receivables[index] + inventory[index] + payables[index] + accruedExpenses[index] + deferredRevenue[index],
  )
  const projectedOperatingCashFlow = projectedNetIncome.map(
    (value, index) =>
      value +
      projectedDepreciation[index] +
      projectedSbc[index] +
      projectedReceivables[index] +
      projectedInventory[index] +
      projectedPayables[index] +
      projectedAccruedExpenses[index] +
      projectedDeferredRevenue[index],
  )
  const capex = revenue.map((value) => Math.round(value * -0.055))
  const projectedCapex = projectedRevenue.map((value) => Math.round(value * -0.052))
  const debtIssuance = [0, 2500, 0, 1800, 0]
  const projectedDebtIssuance = [0, 0, 1200, 0, 0]
  const debtRepayment = [-1400, -1800, -2200, -1700, -2100]
  const projectedDebtRepayment = [-1900, -1900, -2400, -2100, -2100]
  const leaseFinancing = revenue.map((value) => Math.round(value * -0.004))
  const projectedLeaseFinancing = projectedRevenue.map((value) => Math.round(value * -0.004))
  const foreignExchangeCash = [-90, 60, -150, 70, -45]
  const projectedForeignExchangeCash = projectedYears.map(() => -35)
  const cashChange = operatingCashFlow.map(
    (value, index) => value + capex[index] + debtIssuance[index] + debtRepayment[index] + leaseFinancing[index] + foreignExchangeCash[index],
  )
  const projectedCashChange = projectedOperatingCashFlow.map(
    (value, index) =>
      value +
      projectedCapex[index] +
      projectedDebtIssuance[index] +
      projectedDebtRepayment[index] +
      projectedLeaseFinancing[index] +
      projectedForeignExchangeCash[index],
  )

  return {
    assumptions,
    transcripts: [
      {
        id: `${company.ticker}-latest-call`,
        ticker: company.ticker,
        quarter: "Latest available",
        date: "Pulled from Finnhub transcript metadata when API key is present",
        evidence: ["free cash flow", "capex", "working capital", "debt maturity", "refinancing", "interest expense", "leases", "liquidity", "guidance", "margins", "one-time items", "foreign exchange"],
      },
    ],
    filings: [
      {
        accessionNumber: "latest-10k",
        form: "10-K",
        fiscalYear: 2025,
        filedAt: "Latest SEC submissions response",
        sourceUrl: company.cik ? `https://data.sec.gov/submissions/CIK${company.cik.padStart(10, "0")}.json` : "https://data.sec.gov/submissions/",
      },
    ],
    incomeStatement: {
      title: "Detailed Line-Item Income Statement",
      years,
      projectedYears,
      lineItems: [
        { id: "assumption-revenue", label: "Assumption: revenue growth", historical: [], projected: projectedYears.map(() => 5.8), formula: "Historical CAGR + transcript guidance", notes: notes(revenueAssumption) },
        { id: "revenue", label: "Revenue", historical: revenue, projected: projectedRevenue, formula: "Prior year revenue x growth", notes: notes(revenueAssumption) },
        { id: "cost-of-revenue", label: "Cost of revenue", historical: costOfRevenue, projected: projectedCost, formula: "Revenue x gross margin assumption", notes: notes(marginAssumption) },
        { id: "gross-profit", label: "Gross profit", historical: grossProfit, projected: projectedGrossProfit, formula: "Revenue + cost of revenue", notes: notes(marginAssumption) },
        { id: "operating-expense", label: "Operating expenses", historical: operatingExpense, projected: projectedOperatingExpense, formula: "Revenue x operating expense ratio", notes: notes(marginAssumption) },
        { id: "operating-income", label: "Operating income", historical: operatingIncome, projected: projectedOperatingIncome, formula: "Gross profit + operating expenses", notes: notes(marginAssumption) },
        { id: "interest-expense", label: "Interest expense", historical: interestExpense, projected: projectedInterestExpense, formula: "Debt and rate outlook from filings/transcripts", notes: notes(marginAssumption) },
        { id: "foreign-exchange", label: "Foreign exchange gain / (loss)", historical: foreignExchange, projected: projectedForeignExchange, formula: "Historical average unless FX commentary overrides", notes: notes(fxAssumption) },
        { id: "tax-expense", label: "Tax expense", historical: taxExpense, projected: projectedTaxExpense, formula: "Pre-tax income x normalized tax rate", notes: notes(marginAssumption) },
        { id: "net-income", label: "Net income", historical: netIncome, projected: projectedNetIncome, formula: "Operating income + interest + FX + tax", notes: notes(marginAssumption) },
      ],
    },
    cashFlowStatement: {
      title: "Detailed Line-Item Cash Flow Statement",
      years,
      projectedYears,
      lineItems: [
        { id: "assumption-working-capital", label: "Assumption: working capital ratios", historical: [], projected: projectedYears.map(() => 1.4), formula: "Historical revenue ratios by account", notes: notes(workingCapitalAssumption) },
        { id: "assumption-capex", label: "Assumption: capex / revenue", historical: [], projected: projectedYears.map(() => -5.2), formula: "Historical capex ratio + guidance", notes: notes(capexAssumption) },
        { id: "net-income", label: "Net income", historical: netIncome, projected: projectedNetIncome, formula: "Linked from income statement", notes: notes(marginAssumption) },
        { id: "depreciation-amortization", label: "Depreciation & amortization", historical: depreciation, projected: projectedDepreciation, formula: "Revenue x D&A ratio", notes: notes(marginAssumption) },
        { id: "share-based-compensation", label: "Share-based compensation", historical: sbc, projected: projectedSbc, formula: "Revenue x SBC ratio", notes: notes(marginAssumption) },
        { id: "receivables", label: "Change in receivables", historical: receivables, projected: projectedReceivables, formula: "Revenue x AR change ratio", notes: notes(workingCapitalAssumption) },
        { id: "inventory", label: "Change in inventory", historical: inventory, projected: projectedInventory, formula: "Revenue x inventory change ratio", notes: notes(workingCapitalAssumption) },
        { id: "payables", label: "Change in payables", historical: payables, projected: projectedPayables, formula: "Revenue x AP change ratio", notes: notes(workingCapitalAssumption) },
        { id: "accrued-expenses", label: "Change in accrued expenses", historical: accruedExpenses, projected: projectedAccruedExpenses, formula: "Revenue x accrued expense ratio", notes: notes(workingCapitalAssumption) },
        { id: "deferred-revenue", label: "Change in deferred revenue", historical: deferredRevenue, projected: projectedDeferredRevenue, formula: "Revenue x deferred revenue ratio", notes: notes(workingCapitalAssumption) },
        { id: "operating-cash-flow", label: "Net cash from operating activities", historical: operatingCashFlow, projected: projectedOperatingCashFlow, formula: "Net income + non-cash items + working capital", notes: notes(workingCapitalAssumption) },
        { id: "capital-expenditures", label: "Capital expenditures", historical: capex, projected: projectedCapex, formula: "Revenue x capex ratio", notes: notes(capexAssumption) },
        { id: "debt-issuance", label: "Debt issuance", historical: debtIssuance, projected: projectedDebtIssuance, formula: "Known financing plan and refinancing commentary", notes: notes(capexAssumption) },
        { id: "debt-repayment", label: "Debt repayments and maturities", historical: debtRepayment, projected: projectedDebtRepayment, formula: "Debt maturity schedule and repayments", notes: notes(capexAssumption) },
        { id: "lease-financing", label: "Lease and financing obligations", historical: leaseFinancing, projected: projectedLeaseFinancing, formula: "Lease disclosures and revenue ratio", notes: notes(capexAssumption) },
        { id: "foreign-exchange-cash", label: "Effect of foreign exchange on cash", historical: foreignExchangeCash, projected: projectedForeignExchangeCash, formula: "Historical translation effect unless FX evidence overrides", notes: notes(fxAssumption) },
        { id: "cash-change", label: "Net change in cash", historical: cashChange, projected: projectedCashChange, formula: "Operating cash flow + capex + financing + FX cash effect", notes: notes(fxAssumption) },
      ],
    },
  }
}
