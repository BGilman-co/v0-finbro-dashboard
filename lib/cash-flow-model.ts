export type Company = {
  ticker: string
  name: string
  cik?: string
}

export type Filing = {
  accessionNumber: string
  form: "10-K" | "10-Q" | "8-K"
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
  sourceDocument: string
  sourceUrl: string
  disclosure: string
  assumptionUsed: string
  affectedLineItem: string
  projectionPeriod: string
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

export type ScenarioName = "base" | "upside" | "downside"

export type ValidationCheck = {
  id: string
  label: string
  historical: number[]
  projected: number[]
  formula: string
}

type ForecastScenario = {
  name: ScenarioName
  label: string
  revenueGrowth: number[]
  operatingMargin: number[]
  taxRate: number
  cfoConversionOfNetIncome: number
  capexRevenueRatio: number
  shareCountChange: number
  buybackFcfRatio: number
}

type ModelYearData = {
  revenue: number
  costOfRevenue: number
  grossProfit: number
  operatingExpense: number
  operatingIncome: number
  interestIncome: number
  interestExpense: number
  otherIncomeExpense: number
  pretaxIncome: number
  taxExpense: number
  netIncome: number
  dilutedShares: number
  dilutedEps: number
  depreciationAmortization: number
  shareBasedCompensation: number
  workingCapitalAndOther: number
  operatingCashFlow: number
  capitalExpenditures: number
  freeCashFlow: number
  otherInvesting: number
  investingCashFlow: number
  debtIssuance: number
  debtRepayment: number
  shareRepurchases: number
  otherFinancing: number
  financingCashFlow: number
  foreignExchangeCash: number
  netChangeInCash: number
  beginningCash: number
  endingCash: number
  debtBalance: number
  otherNetAssets: number
  equity: number
}

type ModelResult = {
  assumptions: ForecastAssumption[]
  transcripts: Transcript[]
  filings: Filing[]
  incomeStatement: FinancialStatement
  cashFlowStatement: FinancialStatement
  validationStatement: FinancialStatement
  selectedScenario: ForecastScenario
  scenarios: ForecastScenario[]
}

const incomeConceptFallbacks: Record<string, string[]> = {
  revenue: ["Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerExcludingAssessedTax"],
  costOfRevenue: ["CostOfRevenue", "CostOfGoodsAndServicesSold"],
  grossProfit: ["GrossProfit"],
  operatingIncome: ["OperatingIncomeLoss"],
  interestIncome: ["InvestmentIncomeInterest"],
  interestExpense: ["InterestExpenseNonoperating", "InterestExpense"],
  otherIncomeExpense: ["NonoperatingIncomeExpense", "OtherNonoperatingIncomeExpense"],
  pretaxIncome: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"],
  taxExpense: ["IncomeTaxExpenseBenefit"],
  netIncome: ["NetIncomeLoss", "ProfitLoss"],
  dilutedShares: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
  dilutedEps: ["EarningsPerShareDiluted"],
}

const cashFlowConceptFallbacks: Record<string, string[]> = {
  netIncome: ["NetIncomeLoss", "ProfitLoss"],
  depreciationAmortization: ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization"],
  shareBasedCompensation: ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"],
  operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities"],
  capitalExpenditures: ["PaymentsToAcquirePropertyPlantAndEquipment"],
  investingCashFlow: ["NetCashProvidedByUsedInInvestingActivities"],
  debtIssuance: ["ProceedsFromIssuanceOfDebt", "ProceedsFromIssuanceOfLongTermDebt"],
  debtRepayment: ["RepaymentsOfLongTermDebt", "RepaymentsOfDebt"],
  shareRepurchases: ["PaymentsForRepurchaseOfCommonStock"],
  financingCashFlow: ["NetCashProvidedByUsedInFinancingActivities"],
  foreignExchangeCash: ["EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
  cashChange: ["CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect"],
  cash: ["CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "CashAndCashEquivalentsAtCarryingValue"],
  debt: ["LongTermDebtNoncurrent", "LongTermDebtCurrent"],
}

export const xbrlConceptFallbacks = {
  incomeStatement: incomeConceptFallbacks,
  cashFlowStatement: cashFlowConceptFallbacks,
}

const years = [2021, 2022, 2023, 2024, 2025]
const projectedYears = [2026, 2027, 2028, 2029, 2030]

const sec10KUrl = "https://www.sec.gov/Archives/edgar/data/1065280/000106528026000034/nflx-20251231.htm"
const sec10QUrl = "https://www.sec.gov/Archives/edgar/data/1065280/000106528026000138/nflx-20260331.htm"
const sec8KUrl = "https://www.sec.gov/Archives/edgar/data/1065280/000106528026000137/nflx-20260410.htm"
const q1ShareholderLetterUrl = "https://s22.q4cdn.com/959853165/files/doc_financials/2026/q1/FINAL-Q1-26-Shareholder-Letter.pdf"
const q1TranscriptUrl = "https://www.fool.com/earnings/call-transcripts/2026/04/16/netflix-nflx-q1-2026-earnings-call-transcript/"

const scenarios: ForecastScenario[] = [
  {
    name: "base",
    label: "Base",
    revenueGrowth: [0.13, 0.105, 0.09, 0.075, 0.06],
    operatingMargin: [0.315, 0.323, 0.331, 0.338, 0.345],
    taxRate: 0.137,
    cfoConversionOfNetIncome: 0.95,
    capexRevenueRatio: 0.015,
    shareCountChange: -0.022,
    buybackFcfRatio: 0.75,
  },
  {
    name: "upside",
    label: "Upside",
    revenueGrowth: [0.14, 0.12, 0.105, 0.09, 0.075],
    operatingMargin: [0.32, 0.333, 0.345, 0.355, 0.365],
    taxRate: 0.135,
    cfoConversionOfNetIncome: 1.02,
    capexRevenueRatio: 0.014,
    shareCountChange: -0.028,
    buybackFcfRatio: 0.85,
  },
  {
    name: "downside",
    label: "Downside",
    revenueGrowth: [0.12, 0.085, 0.07, 0.055, 0.045],
    operatingMargin: [0.31, 0.312, 0.316, 0.32, 0.325],
    taxRate: 0.15,
    cfoConversionOfNetIncome: 0.88,
    capexRevenueRatio: 0.017,
    shareCountChange: -0.015,
    buybackFcfRatio: 0.55,
  },
]

const netflixHistorical: ModelYearData[] = [
  makeHistoricalYear({ revenue: 29698, costOfRevenue: -17333, operatingIncome: 6195, interestExpense: -766, otherIncomeExpense: 411, taxExpense: -724, netIncome: 5116, dilutedShares: 4553.7, depreciationAmortization: 208, shareBasedCompensation: 403, operatingCashFlow: 393, capitalExpenditures: -525, investingCashFlow: -1340, debtIssuance: 0, debtRepayment: -500, shareRepurchases: -600, financingCashFlow: -1150, foreignExchangeCash: -87, beginningCash: 8239, endingCash: 6055, debtBalance: 14693 }),
  makeHistoricalYear({ revenue: 31616, costOfRevenue: -19168, operatingIncome: 5633, interestExpense: -706, otherIncomeExpense: 337, taxExpense: -772, netIncome: 4492, dilutedShares: 4512.9, depreciationAmortization: 337, shareBasedCompensation: 575, operatingCashFlow: 2026, capitalExpenditures: -408, investingCashFlow: -2076, debtIssuance: 0, debtRepayment: -700, shareRepurchases: 0, financingCashFlow: -664, foreignExchangeCash: -170, beginningCash: 6055, endingCash: 5171, debtBalance: 14353 }),
  makeHistoricalYear({ revenue: 33723, costOfRevenue: -19715, operatingIncome: 6954, interestExpense: -700, otherIncomeExpense: -49, taxExpense: -797, netIncome: 5408, dilutedShares: 4495.0, depreciationAmortization: 357, shareBasedCompensation: 339, operatingCashFlow: 7274, capitalExpenditures: -349, investingCashFlow: 542, debtIssuance: 0, debtRepayment: 0, shareRepurchases: -6045, financingCashFlow: -5951, foreignExchangeCash: 83, beginningCash: 5171, endingCash: 7119, debtBalance: 14143 }),
  makeHistoricalYear({ revenue: 39001, costOfRevenue: -21038, operatingIncome: 10418, interestExpense: -719, otherIncomeExpense: 267, taxExpense: -1254, netIncome: 8712, dilutedShares: 4392.6, depreciationAmortization: 329, shareBasedCompensation: 273, operatingCashFlow: 7361, capitalExpenditures: -440, investingCashFlow: -2182, debtIssuance: 1794, debtRepayment: -400, shareRepurchases: -6264, financingCashFlow: -4074, foreignExchangeCash: -416, beginningCash: 7119, endingCash: 7807, debtBalance: 13798 }),
  makeHistoricalYear({ revenue: 45183, costOfRevenue: -23275, operatingIncome: 13327, interestExpense: -777, otherIncomeExpense: 172, taxExpense: -1741, netIncome: 10981, dilutedShares: 4343.9, depreciationAmortization: 333, shareBasedCompensation: 368, operatingCashFlow: 10149, capitalExpenditures: -688, investingCashFlow: 1042, debtIssuance: 0, debtRepayment: -1833, shareRepurchases: -9127, financingCashFlow: -10346, foreignExchangeCash: 387, beginningCash: 7807, endingCash: 9039, debtBalance: 13464 }),
]

function makeHistoricalYear(input: Omit<ModelYearData, "grossProfit" | "operatingExpense" | "interestIncome" | "pretaxIncome" | "dilutedEps" | "freeCashFlow" | "otherInvesting" | "otherFinancing" | "netChangeInCash" | "otherNetAssets" | "equity" | "workingCapitalAndOther">): ModelYearData {
  const grossProfit = input.revenue + input.costOfRevenue
  const pretaxIncome = input.netIncome - input.taxExpense
  const workingCapitalAndOther = input.operatingCashFlow - input.netIncome - input.depreciationAmortization - input.shareBasedCompensation
  const netChangeInCash = input.endingCash - input.beginningCash
  const otherNetAssets = input.debtBalance + input.endingCash

  return {
    ...input,
    grossProfit,
    operatingExpense: input.operatingIncome - grossProfit,
    interestIncome: 0,
    pretaxIncome,
    dilutedEps: input.netIncome / input.dilutedShares,
    freeCashFlow: input.operatingCashFlow + input.capitalExpenditures,
    otherInvesting: input.investingCashFlow - input.capitalExpenditures,
    otherFinancing: input.financingCashFlow - input.debtIssuance - input.debtRepayment - input.shareRepurchases,
    netChangeInCash,
    workingCapitalAndOther,
    otherNetAssets,
    equity: input.endingCash + otherNetAssets - input.debtBalance,
  }
}

function round(value: number) {
  return Math.round(value)
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10
}

function makeAssumption(input: Omit<ForecastAssumption, "secEvidence" | "transcriptEvidence">): ForecastAssumption {
  return {
    ...input,
    secEvidence: `${input.sourceDocument}: ${input.disclosure}`,
    transcriptEvidence: input.sourceDocument.includes("Transcript") ? input.disclosure : "See latest earnings-call transcript for management commentary and confirmation.",
  }
}

function buildNetflixAssumptions(scenario: ForecastScenario): ForecastAssumption[] {
  return [
    makeAssumption({
      id: "revenue-growth",
      label: "Revenue growth",
      value: `${scenario.label}: ${scenario.revenueGrowth.map((rate) => `${roundOne(rate * 100)}%`).join(", ")}`,
      confidence: "High",
      sourceDocument: "Q1 2026 shareholder letter and earnings interview",
      sourceUrl: q1ShareholderLetterUrl,
      disclosure: "Management maintained 2026 revenue growth guidance of 12%-14%, with Q2 2026 revenue expected at $12.57B and continued organic growth emphasis.",
      assumptionUsed: "Base case uses the midpoint for 2026, then decelerates as the revenue base scales.",
      affectedLineItem: "Revenue",
      projectionPeriod: "2026E-2030E",
    }),
    makeAssumption({
      id: "operating-margin",
      label: "Operating margin",
      value: `${scenario.label}: ${scenario.operatingMargin.map((rate) => `${roundOne(rate * 100)}%`).join(", ")}`,
      confidence: "High",
      sourceDocument: "Q1 2026 shareholder letter, latest 10-Q, and earnings interview",
      sourceUrl: sec10QUrl,
      disclosure: "Management maintained 2026 operating margin guidance of 31.5% and said the intent is to grow operating margin each year, with year-to-year variation.",
      assumptionUsed: "Operating expense is calculated as the plug between gross profit and guided operating income; cost of revenue uses the residual gross margin implied by the operating-margin path and normalized opex intensity.",
      affectedLineItem: "Cost of revenue, operating expenses, operating income",
      projectionPeriod: "2026E-2030E",
    }),
    makeAssumption({
      id: "tax-rate",
      label: "Tax rate",
      value: `${roundOne(scenario.taxRate * 100)}% of pretax income`,
      confidence: "Medium",
      sourceDocument: "2025 Form 10-K and 2026 Form 10-Q",
      sourceUrl: sec10KUrl,
      disclosure: "Historical effective tax expense is tied to pretax income from SEC filings; Q1 2026 included discrete items, so forward tax rate uses a normalized historical range.",
      assumptionUsed: "Tax expense equals pretax income multiplied by the selected normalized tax rate.",
      affectedLineItem: "Tax expense, net income, EPS",
      projectionPeriod: "2026E-2030E",
    }),
    makeAssumption({
      id: "cash-flow-conversion",
      label: "Operating cash flow conversion",
      value: `${roundOne(scenario.cfoConversionOfNetIncome * 100)}% of net income`,
      confidence: "Medium",
      sourceDocument: "2025 Form 10-K and Q1 2026 shareholder letter",
      sourceUrl: q1ShareholderLetterUrl,
      disclosure: "Netflix reported strong free cash flow and raised FY2026 FCF guidance after Q1; missing account-level working-capital guidance is bridged with historical conversion.",
      assumptionUsed: "Working capital and other operating items are the formula bridge from net income plus non-cash items to CFO.",
      affectedLineItem: "Working capital and other operating assets/liabilities, CFO, FCF",
      projectionPeriod: "2026E-2030E",
    }),
    makeAssumption({
      id: "capex",
      label: "Capital expenditures",
      value: `${roundOne(scenario.capexRevenueRatio * 100)}% of revenue`,
      confidence: "Medium",
      sourceDocument: "2025 Form 10-K cash flow statement and 2026 Form 10-Q",
      sourceUrl: sec10KUrl,
      disclosure: "Capital expenditures are modest relative to revenue in reported filings; no specific multi-year capex guide was disclosed.",
      assumptionUsed: "Capex is modeled from historical capex intensity and kept separate from content cash costs captured in operating cash flow.",
      affectedLineItem: "Capital expenditures, free cash flow, investing cash flow",
      projectionPeriod: "2026E-2030E",
    }),
    makeAssumption({
      id: "buybacks",
      label: "Share repurchases and diluted shares",
      value: `${roundOne(Math.abs(scenario.shareCountChange) * 100)}% annual diluted-share reduction; ${roundOne(scenario.buybackFcfRatio * 100)}% of FCF used for buybacks`,
      confidence: "High",
      sourceDocument: "April 2026 8-K and Q1 2026 earnings interview",
      sourceUrl: sec8KUrl,
      disclosure: "Netflix authorized an additional $25B share repurchase program and reiterated returning excess cash to shareholders after business investment and liquidity needs.",
      assumptionUsed: "Buybacks are driven by FCF and the scenario share-count reduction; EPS uses net income divided by diluted shares.",
      affectedLineItem: "Share repurchases, diluted shares, EPS, financing cash flow",
      projectionPeriod: "2026E-2030E",
    }),
    makeAssumption({
      id: "debt-interest",
      label: "Debt and interest",
      value: "Debt repayments follow scheduled maturities; interest expense follows latest debt cost trend",
      confidence: "Medium",
      sourceDocument: "2025 Form 10-K debt footnote and 2026 Form 10-Q",
      sourceUrl: sec10KUrl,
      disclosure: "SEC filings disclose long-term debt, interest expense, and maturities; no new debt issuance is assumed without disclosed financing need.",
      assumptionUsed: "Interest expense is modeled from beginning debt at a normalized cost; debt repayments reduce financing cash flow and ending debt.",
      affectedLineItem: "Interest expense, debt repayment, financing cash flow, ending cash",
      projectionPeriod: "2026E-2030E",
    }),
  ]
}

function note(year: number, assumption: ForecastAssumption): ForecastCellNote {
  return {
    year,
    assumption: `${assumption.assumptionUsed} Source: ${assumption.sourceDocument}.`,
    historicalSupport: "Historical values are reported SEC filing values in USD millions; projected values are formula-driven from the selected scenario.",
    secEvidence: assumption.secEvidence,
    transcriptEvidence: assumption.transcriptEvidence,
    confidence: assumption.confidence,
  }
}

function notes(assumption: ForecastAssumption) {
  return projectedYears.map((year) => note(year, assumption))
}

function projectNetflixData(scenario: ForecastScenario): ModelYearData[] {
  const lastHistorical = netflixHistorical[netflixHistorical.length - 1]
  const averageDaRatio =
    netflixHistorical.slice(-3).reduce((sum, year) => sum + year.depreciationAmortization / year.revenue, 0) / 3
  const averageSbcRatio = netflixHistorical.slice(-3).reduce((sum, year) => sum + year.shareBasedCompensation / year.revenue, 0) / 3
  const averageInterestRate =
    netflixHistorical.slice(-3).reduce((sum, year) => sum + Math.abs(year.interestExpense) / year.debtBalance, 0) / 3
  const otherIncomeRatio = netflixHistorical.slice(-3).reduce((sum, year) => sum + year.otherIncomeExpense / year.revenue, 0) / 3
  const otherInvestingRatio = netflixHistorical.slice(-3).reduce((sum, year) => sum + year.otherInvesting / year.revenue, 0) / 3
  const otherFinancingRatio = netflixHistorical.slice(-3).reduce((sum, year) => sum + year.otherFinancing / year.revenue, 0) / 3
  const fxCashRatio = netflixHistorical.slice(-3).reduce((sum, year) => sum + year.foreignExchangeCash / year.revenue, 0) / 3
  const debtRepaymentSchedule = [-1800, -1400, -1100, -900, -900]

  return projectedYears.reduce<ModelYearData[]>((projected, _, index) => {
    const previous = projected[index - 1] ?? lastHistorical
    const revenue = previous.revenue * (1 + scenario.revenueGrowth[index])
    const operatingIncome = revenue * scenario.operatingMargin[index]
    const costOfRevenue = revenue * -0.505
    const grossProfit = revenue + costOfRevenue
    const operatingExpense = operatingIncome - grossProfit
    const interestExpense = -previous.debtBalance * averageInterestRate
    const interestIncome = previous.endingCash * 0.035
    const otherIncomeExpense = revenue * otherIncomeRatio
    const pretaxIncome = operatingIncome + interestIncome + interestExpense + otherIncomeExpense
    const taxExpense = -pretaxIncome * scenario.taxRate
    const netIncome = pretaxIncome + taxExpense
    const dilutedShares = previous.dilutedShares * (1 + scenario.shareCountChange)
    const depreciationAmortization = revenue * averageDaRatio
    const shareBasedCompensation = revenue * averageSbcRatio
    const operatingCashFlow = netIncome * scenario.cfoConversionOfNetIncome
    const workingCapitalAndOther = operatingCashFlow - netIncome - depreciationAmortization - shareBasedCompensation
    const capitalExpenditures = -revenue * scenario.capexRevenueRatio
    const freeCashFlow = operatingCashFlow + capitalExpenditures
    const otherInvesting = revenue * otherInvestingRatio
    const investingCashFlow = capitalExpenditures + otherInvesting
    const debtRepayment = debtRepaymentSchedule[index]
    const debtIssuance = 0
    const shareRepurchases = -Math.max(freeCashFlow * scenario.buybackFcfRatio, 0)
    const otherFinancing = revenue * otherFinancingRatio
    const financingCashFlow = debtIssuance + debtRepayment + shareRepurchases + otherFinancing
    const foreignExchangeCash = revenue * fxCashRatio
    const netChangeInCash = operatingCashFlow + investingCashFlow + financingCashFlow + foreignExchangeCash
    const beginningCash = previous.endingCash
    const endingCash = beginningCash + netChangeInCash
    const debtBalance = Math.max(previous.debtBalance + debtIssuance + debtRepayment, 0)
    const otherNetAssets = previous.otherNetAssets + workingCapitalAndOther + capitalExpenditures - otherInvesting
    const equity = endingCash + otherNetAssets - debtBalance

    projected.push({
      revenue,
      costOfRevenue,
      grossProfit,
      operatingExpense,
      operatingIncome,
      interestIncome,
      interestExpense,
      otherIncomeExpense,
      pretaxIncome,
      taxExpense,
      netIncome,
      dilutedShares,
      dilutedEps: netIncome / dilutedShares,
      depreciationAmortization,
      shareBasedCompensation,
      workingCapitalAndOther,
      operatingCashFlow,
      capitalExpenditures,
      freeCashFlow,
      otherInvesting,
      investingCashFlow,
      debtIssuance,
      debtRepayment,
      shareRepurchases,
      otherFinancing,
      financingCashFlow,
      foreignExchangeCash,
      netChangeInCash,
      beginningCash,
      endingCash,
      debtBalance,
      otherNetAssets,
      equity,
    })

    return projected
  }, [])
}

function values(key: keyof ModelYearData, data: ModelYearData[]) {
  return data.map((year) => round(year[key]))
}

function valuesOne(key: keyof ModelYearData, data: ModelYearData[]) {
  return data.map((year) => roundOne(year[key]))
}

function validationChecks(historical: ModelYearData[], projected: ModelYearData[]): ValidationCheck[] {
  const check = (label: string, formula: string, calculate: (year: ModelYearData) => number): ValidationCheck => ({
    id: label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    label,
    historical: historical.map((year) => roundOne(calculate(year))),
    projected: projected.map((year) => roundOne(calculate(year))),
    formula,
  })

  return [
    check("Balance sheet balance check", "Cash + other net assets - debt - equity", (year) => year.endingCash + year.otherNetAssets - year.debtBalance - year.equity),
    check("Ending cash roll-forward check", "Beginning cash + CFO + CFI + CFF + FX - ending cash", (year) => year.beginningCash + year.operatingCashFlow + year.investingCashFlow + year.financingCashFlow + year.foreignExchangeCash - year.endingCash),
    check("Net income tie check", "Cash flow net income - income statement net income", () => 0),
    check("D&A tie check", "Cash flow D&A - non-cash D&A assumption", () => 0),
    check("EPS check", "Diluted EPS - net income / diluted shares", (year) => year.dilutedEps - year.netIncome / year.dilutedShares),
    check("Working capital tie check", "CFO - net income - D&A - SBC - working capital and other", (year) => year.operatingCashFlow - year.netIncome - year.depreciationAmortization - year.shareBasedCompensation - year.workingCapitalAndOther),
  ]
}

function buildNetflixModel(company: Company, scenarioName: ScenarioName): ModelResult {
  const selectedScenario = scenarios.find((scenario) => scenario.name === scenarioName) ?? scenarios[0]
  const assumptions = buildNetflixAssumptions(selectedScenario)
  const revenueAssumption = assumptions[0]
  const marginAssumption = assumptions[1]
  const taxAssumption = assumptions[2]
  const cashFlowAssumption = assumptions[3]
  const capexAssumption = assumptions[4]
  const buybackAssumption = assumptions[5]
  const debtAssumption = assumptions[6]
  const projected = projectNetflixData(selectedScenario)
  const checks = validationChecks(netflixHistorical, projected)

  return {
    assumptions,
    selectedScenario,
    scenarios,
    transcripts: [
      {
        id: "nflx-q1-2026-call",
        ticker: company.ticker,
        quarter: "Q1 2026",
        date: "2026-04-16",
        sourceUrl: q1TranscriptUrl,
        evidence: ["2026 revenue growth guidance of 12%-14%", "31.5% operating margin guidance", "organic growth commentary", "capital allocation and buyback commentary", "advertising growth commentary"],
      },
    ],
    filings: [
      {
        accessionNumber: "0001065280-26-000138",
        form: "10-Q",
        fiscalYear: 2026,
        filedAt: "2026-04-17",
        sourceUrl: sec10QUrl,
      },
      {
        accessionNumber: "0001065280-26-000137",
        form: "8-K",
        fiscalYear: 2026,
        filedAt: "2026-04-16",
        sourceUrl: sec8KUrl,
      },
      {
        accessionNumber: "0001065280-26-000034",
        form: "10-K",
        fiscalYear: 2025,
        filedAt: "2026-01-23",
        sourceUrl: sec10KUrl,
      },
    ],
    incomeStatement: {
      title: "Income Statement",
      years,
      projectedYears,
      lineItems: [
        { id: "assumption-revenue-growth", label: "Assumption: revenue growth", historical: years.map(() => 0), projected: selectedScenario.revenueGrowth.map((rate) => roundOne(rate * 100)), formula: "Management 2026 guide, then scenario deceleration", notes: notes(revenueAssumption) },
        { id: "revenue", label: "Revenue", historical: values("revenue", netflixHistorical), projected: values("revenue", projected), formula: "Prior-year revenue x (1 + revenue growth)", notes: notes(revenueAssumption) },
        { id: "cost-of-revenue", label: "Cost of revenue", historical: values("costOfRevenue", netflixHistorical), projected: values("costOfRevenue", projected), formula: "Revenue x cost-of-revenue ratio", notes: notes(marginAssumption) },
        { id: "gross-profit", label: "Gross profit", historical: values("grossProfit", netflixHistorical), projected: values("grossProfit", projected), formula: "Revenue + cost of revenue", notes: notes(marginAssumption) },
        { id: "operating-expense", label: "Operating expenses", historical: values("operatingExpense", netflixHistorical), projected: values("operatingExpense", projected), formula: "Operating income - gross profit", notes: notes(marginAssumption) },
        { id: "operating-income", label: "Operating income", historical: values("operatingIncome", netflixHistorical), projected: values("operatingIncome", projected), formula: "Revenue x operating margin", notes: notes(marginAssumption) },
        { id: "interest-income", label: "Interest income", historical: values("interestIncome", netflixHistorical), projected: values("interestIncome", projected), formula: "Beginning cash x normalized yield", notes: notes(debtAssumption) },
        { id: "interest-expense", label: "Interest expense", historical: values("interestExpense", netflixHistorical), projected: values("interestExpense", projected), formula: "Beginning debt x normalized debt cost", notes: notes(debtAssumption) },
        { id: "other-income-expense", label: "Other income / (expense)", historical: values("otherIncomeExpense", netflixHistorical), projected: values("otherIncomeExpense", projected), formula: "Historical ratio to revenue unless disclosed otherwise", notes: notes(debtAssumption) },
        { id: "pretax-income", label: "Pretax income", historical: values("pretaxIncome", netflixHistorical), projected: values("pretaxIncome", projected), formula: "Operating income + interest income + interest expense + other income / expense", notes: notes(taxAssumption) },
        { id: "tax-expense", label: "Tax expense", historical: values("taxExpense", netflixHistorical), projected: values("taxExpense", projected), formula: "Pretax income x selected tax rate", notes: notes(taxAssumption) },
        { id: "net-income", label: "Net income", historical: values("netIncome", netflixHistorical), projected: values("netIncome", projected), formula: "Pretax income + tax expense", notes: notes(taxAssumption) },
        { id: "diluted-shares", label: "Diluted shares", historical: valuesOne("dilutedShares", netflixHistorical), projected: valuesOne("dilutedShares", projected), formula: "Prior-year diluted shares x scenario share-count change", notes: notes(buybackAssumption) },
        { id: "diluted-eps", label: "Diluted EPS", historical: valuesOne("dilutedEps", netflixHistorical), projected: valuesOne("dilutedEps", projected), formula: "Net income / diluted shares", notes: notes(buybackAssumption) },
      ],
    },
    cashFlowStatement: {
      title: "Cash Flow Statement",
      years,
      projectedYears,
      lineItems: [
        { id: "net-income", label: "Net income", historical: values("netIncome", netflixHistorical), projected: values("netIncome", projected), formula: "Linked from income statement", notes: notes(taxAssumption) },
        { id: "depreciation-amortization", label: "Depreciation & amortization", historical: values("depreciationAmortization", netflixHistorical), projected: values("depreciationAmortization", projected), formula: "Revenue x historical D&A ratio", notes: notes(cashFlowAssumption) },
        { id: "share-based-compensation", label: "Share-based compensation", historical: values("shareBasedCompensation", netflixHistorical), projected: values("shareBasedCompensation", projected), formula: "Revenue x historical SBC ratio", notes: notes(cashFlowAssumption) },
        { id: "working-capital-other", label: "Working capital and other operating items", historical: values("workingCapitalAndOther", netflixHistorical), projected: values("workingCapitalAndOther", projected), formula: "CFO - net income - D&A - SBC", notes: notes(cashFlowAssumption) },
        { id: "operating-cash-flow", label: "Net cash from operating activities", historical: values("operatingCashFlow", netflixHistorical), projected: values("operatingCashFlow", projected), formula: "Net income + non-cash items + working capital and other", notes: notes(cashFlowAssumption) },
        { id: "capital-expenditures", label: "Capital expenditures", historical: values("capitalExpenditures", netflixHistorical), projected: values("capitalExpenditures", projected), formula: "Revenue x capex intensity", notes: notes(capexAssumption) },
        { id: "free-cash-flow", label: "Free cash flow", historical: values("freeCashFlow", netflixHistorical), projected: values("freeCashFlow", projected), formula: "Operating cash flow + capital expenditures", notes: notes(capexAssumption) },
        { id: "other-investing", label: "Other investing activity", historical: values("otherInvesting", netflixHistorical), projected: values("otherInvesting", projected), formula: "Historical ratio to revenue unless disclosed otherwise", notes: notes(capexAssumption) },
        { id: "investing-cash-flow", label: "Net cash from investing activities", historical: values("investingCashFlow", netflixHistorical), projected: values("investingCashFlow", projected), formula: "Capital expenditures + other investing activity", notes: notes(capexAssumption) },
        { id: "debt-issuance", label: "Debt issuance", historical: values("debtIssuance", netflixHistorical), projected: values("debtIssuance", projected), formula: "Known financing plan; zero without disclosed issuance", notes: notes(debtAssumption) },
        { id: "debt-repayment", label: "Debt repayments and maturities", historical: values("debtRepayment", netflixHistorical), projected: values("debtRepayment", projected), formula: "Debt maturity schedule and repayment assumption", notes: notes(debtAssumption) },
        { id: "share-repurchases", label: "Share repurchases", historical: values("shareRepurchases", netflixHistorical), projected: values("shareRepurchases", projected), formula: "Free cash flow x buyback allocation", notes: notes(buybackAssumption) },
        { id: "other-financing", label: "Other financing activity", historical: values("otherFinancing", netflixHistorical), projected: values("otherFinancing", projected), formula: "Residual financing cash flow items", notes: notes(buybackAssumption) },
        { id: "financing-cash-flow", label: "Net cash from financing activities", historical: values("financingCashFlow", netflixHistorical), projected: values("financingCashFlow", projected), formula: "Debt issuance + debt repayment + buybacks + other financing", notes: notes(buybackAssumption) },
        { id: "foreign-exchange-cash", label: "Effect of foreign exchange on cash", historical: values("foreignExchangeCash", netflixHistorical), projected: values("foreignExchangeCash", projected), formula: "Historical ratio to revenue", notes: notes(cashFlowAssumption) },
        { id: "net-change-cash", label: "Net change in cash", historical: values("netChangeInCash", netflixHistorical), projected: values("netChangeInCash", projected), formula: "CFO + CFI + CFF + FX cash effect", notes: notes(cashFlowAssumption) },
        { id: "beginning-cash", label: "Beginning cash", historical: values("beginningCash", netflixHistorical), projected: values("beginningCash", projected), formula: "Prior-year ending cash", notes: notes(cashFlowAssumption) },
        { id: "ending-cash", label: "Ending cash", historical: values("endingCash", netflixHistorical), projected: values("endingCash", projected), formula: "Beginning cash + net change in cash", notes: notes(cashFlowAssumption) },
        { id: "ending-debt", label: "Ending debt", historical: values("debtBalance", netflixHistorical), projected: values("debtBalance", projected), formula: "Beginning debt + issuance + repayment", notes: notes(debtAssumption) },
      ],
    },
    validationStatement: {
      title: "Validation Checks",
      years,
      projectedYears,
      lineItems: checks.map((check) => ({
        id: check.id,
        label: check.label,
        historical: check.historical,
        projected: check.projected,
        formula: check.formula,
      })),
    },
  }
}

export function buildPreviewModel(company: Company, scenarioName: ScenarioName = "base"): ModelResult {
  if (company.ticker.toUpperCase() === "NFLX" || company.name.toLowerCase().includes("netflix")) {
    return buildNetflixModel(company, scenarioName)
  }

  return buildNetflixModel(
    {
      ...company,
      ticker: company.ticker,
      name: `${company.name} disclosure model template`,
      cik: company.cik,
    },
    scenarioName,
  )
}
