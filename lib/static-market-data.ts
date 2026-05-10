"use client"

import { holdings, type Holding } from "@/lib/portfolio-data"
import type {
  Filing,
  FinancialStatement,
  FinancialStatementLine,
  FilingsPayload,
  MarketPayload,
  MarketQuote,
  OptionContract,
  PriceHistoryPayload,
  Security,
} from "@/lib/market-types"

const sp500CsvUrl = "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv"
const appBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ""
const yfinanceSnapshotUrl = `${appBasePath}/data/yfinance-snapshot.json`
const secSnapshotUrl = `${appBasePath}/data/sec-snapshot.json`

function parseCsvLine(line: string) {
  const cells: string[] = []
  let current = ""
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"' && next === '"') {
      current += '"'
      index += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === "," && !inQuotes) {
      cells.push(current)
      current = ""
    } else {
      current += char
    }
  }

  cells.push(current)
  return cells
}

function normalizeSymbol(symbol: string) {
  return symbol.replace(".", "-").trim().toUpperCase()
}

function fallbackSecurity(holding: Holding): Security {
  return {
    symbol: holding.id,
    name: holding.name,
    sector: holding.sector,
    exchange: holding.exchange,
  }
}

export type UniversePayload = {
  securities: Security[]
  count: number
  provider: string
  updatedAt: string
}

type YfinanceSnapshot = {
  provider: string
  updatedAt: string
  universe: Security[]
  quotes: MarketQuote[]
  histories: Record<string, PriceHistoryPayload["points"]>
  options?: Record<string, OptionContract[]>
  message: string
}

let snapshotPromise: Promise<YfinanceSnapshot | null> | null = null

async function loadYfinanceSnapshot() {
  if (!snapshotPromise) {
    snapshotPromise = fetch(yfinanceSnapshotUrl, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`)
        }

        return response.json() as Promise<YfinanceSnapshot>
      })
      .catch(() => null)
  }

  return snapshotPromise
}

type SecSnapshot = {
  provider: "SEC EDGAR"
  updatedAt: string
  companies: Record<string, FilingsPayload>
  message: string
}

let secSnapshotPromise: Promise<SecSnapshot | null> | null = null

async function loadSecSnapshot() {
  if (!secSnapshotPromise) {
    secSnapshotPromise = fetch(secSnapshotUrl, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`)
        }

        return response.json() as Promise<SecSnapshot>
      })
      .catch(() => null)
  }

  return secSnapshotPromise
}

export async function loadSp500Universe(): Promise<UniversePayload> {
  const updatedAt = new Date().toISOString()
  const snapshot = await loadYfinanceSnapshot()

  if (snapshot?.universe?.length) {
    return {
      securities: snapshot.universe,
      count: snapshot.universe.length,
      provider: snapshot.provider,
      updatedAt: snapshot.updatedAt,
    }
  }

  try {
    const response = await fetch(sp500CsvUrl, { cache: "no-store" })

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`)
    }

    const csv = await response.text()
    const [headerLine, ...rows] = csv.trim().split(/\r?\n/)
    const headers = parseCsvLine(headerLine)
    const indexOf = (name: string) => headers.findIndex((header) => header.toLowerCase() === name.toLowerCase())
    const symbolIndex = indexOf("Symbol")
    const nameIndex = indexOf("Security")
    const sectorIndex = indexOf("GICS Sector")
    const industryIndex = indexOf("GICS Sub-Industry")
    const cikIndex = indexOf("CIK")

    const securities = rows
      .map((row): Security | null => {
        const cells = parseCsvLine(row)
        const symbol = normalizeSymbol(cells[symbolIndex] ?? "")
        const name = cells[nameIndex]?.trim()

        if (!symbol || !name) {
          return null
        }

        return {
          symbol,
          name,
          sector: cells[sectorIndex]?.trim() || "Unclassified",
          industry: cells[industryIndex]?.trim() || undefined,
          exchange: "US",
          cik: cells[cikIndex]?.trim().padStart(10, "0") || undefined,
        }
      })
      .filter((security): security is Security => Boolean(security))

    if (securities.length < 400) {
      throw new Error("S&P 500 source returned too few securities")
    }

    return {
      securities,
      count: securities.length,
      provider: "S&P 500 constituents dataset",
      updatedAt,
    }
  } catch {
    const securities = holdings.map(fallbackSecurity)

    return {
      securities,
      count: securities.length,
      provider: "Local fallback",
      updatedAt,
    }
  }
}

export async function loadMarketData(symbols: string[], optionSymbol: string): Promise<MarketPayload> {
  const normalizedSymbols = symbols.map(normalizeSymbol).filter(Boolean)
  const selectedOptionSymbol = normalizeSymbol(optionSymbol || normalizedSymbols[0] || "AAPL")
  const updatedAt = new Date().toISOString()
  const snapshot = await loadYfinanceSnapshot()

  if (!snapshot) {
    return {
      quotes: [],
      options: [],
      provider: "yfinance / Yahoo Finance",
      isLive: false,
      message: "No yfinance snapshot was found. Run the yfinance data job to generate market prices.",
      updatedAt,
    }
  }

  const requestedSymbols = new Set(normalizedSymbols)
  const quotes = snapshot.quotes.filter((quote) => requestedSymbols.has(quote.symbol))

  return {
    quotes,
    options: snapshot.options?.[selectedOptionSymbol] ?? [],
    provider: snapshot.provider,
    isLive: quotes.length > 0,
    message: `${quotes.length} S&P 500 quote records loaded from the latest yfinance snapshot.`,
    updatedAt: snapshot.updatedAt,
  }
}

export async function loadPriceHistory(symbol: string): Promise<PriceHistoryPayload> {
  const normalizedSymbol = normalizeSymbol(symbol)
  const updatedAt = new Date().toISOString()
  const snapshot = await loadYfinanceSnapshot()
  const points = snapshot?.histories?.[normalizedSymbol] ?? []

  return {
    symbol: normalizedSymbol,
    points,
    provider: snapshot?.provider ?? "yfinance / Yahoo Finance",
    message: points.length
      ? `${points.length} daily price records loaded from yfinance.`
      : "No yfinance price history was found for this ticker.",
    updatedAt: snapshot?.updatedAt ?? updatedAt,
  }
}

type CompanySubmissions = {
  cik: string
  name: string
  filings?: {
    recent?: {
      accessionNumber?: string[]
      filingDate?: string[]
      reportDate?: string[]
      form?: string[]
      primaryDocument?: string[]
      primaryDocDescription?: string[]
    }
  }
}

type CompanyFacts = {
  facts?: {
    "us-gaap"?: Record<
      string,
      {
        label?: string
        units?: Record<
          string,
          Array<{
            val?: number
            fy?: number
            fp?: string
            form?: string
            filed?: string
            end?: string
          }>
        >
      }
    >
  }
}

const statementDefinitions: Array<{
  title: string
  rows: Array<{ label: string; tags: string[] }>
}> = [
  {
    title: "Income Statement",
    rows: [
      { label: "Revenue", tags: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"] },
      { label: "Cost of Revenue", tags: ["CostOfRevenue", "CostOfGoodsAndServicesSold"] },
      { label: "Gross Profit", tags: ["GrossProfit"] },
      { label: "Research and Development", tags: ["ResearchAndDevelopmentExpense"] },
      { label: "Selling, General and Administrative", tags: ["SellingGeneralAndAdministrativeExpense"] },
      { label: "Operating Income", tags: ["OperatingIncomeLoss"] },
      { label: "Interest Expense", tags: ["InterestExpenseNonOperating", "InterestExpense"] },
      { label: "Income Before Taxes", tags: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"] },
      { label: "Income Tax Expense", tags: ["IncomeTaxExpenseBenefit"] },
      { label: "Net Income", tags: ["NetIncomeLoss", "ProfitLoss"] },
      { label: "EPS Diluted", tags: ["EarningsPerShareDiluted"] },
    ],
  },
  {
    title: "Balance Sheet",
    rows: [
      { label: "Cash and Equivalents", tags: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"] },
      { label: "Short-term Investments", tags: ["ShortTermInvestments"] },
      { label: "Accounts Receivable", tags: ["AccountsReceivableNetCurrent"] },
      { label: "Inventory", tags: ["InventoryNet"] },
      { label: "Total Current Assets", tags: ["AssetsCurrent"] },
      { label: "Property, Plant and Equipment", tags: ["PropertyPlantAndEquipmentNet"] },
      { label: "Total Assets", tags: ["Assets"] },
      { label: "Accounts Payable", tags: ["AccountsPayableCurrent"] },
      { label: "Total Current Liabilities", tags: ["LiabilitiesCurrent"] },
      { label: "Long-term Debt", tags: ["LongTermDebtNoncurrent", "LongTermDebt"] },
      { label: "Total Liabilities", tags: ["Liabilities"] },
      { label: "Stockholders' Equity", tags: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"] },
    ],
  },
  {
    title: "Cash Flow Statement",
    rows: [
      { label: "Operating Cash Flow", tags: ["NetCashProvidedByUsedInOperatingActivities"] },
      { label: "Capital Expenditures", tags: ["PaymentsToAcquirePropertyPlantAndEquipment"] },
      { label: "Investing Cash Flow", tags: ["NetCashProvidedByUsedInInvestingActivities"] },
      { label: "Financing Cash Flow", tags: ["NetCashProvidedByUsedInFinancingActivities"] },
      { label: "Dividends Paid", tags: ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"] },
      { label: "Share Repurchases", tags: ["PaymentsForRepurchaseOfCommonStock"] },
      { label: "Depreciation and Amortization", tags: ["DepreciationDepletionAndAmortization", "DepreciationDepletionAndAmortizationExpense"] },
    ],
  },
  {
    title: "Other Applicable Metrics",
    rows: [
      { label: "Diluted Shares", tags: ["WeightedAverageNumberOfDilutedSharesOutstanding"] },
      { label: "Basic Shares", tags: ["WeightedAverageNumberOfSharesOutstandingBasic"] },
      { label: "Common Shares Outstanding", tags: ["EntityCommonStockSharesOutstanding", "CommonStocksIncludingAdditionalPaidInCapital"] },
      { label: "Comprehensive Income", tags: ["ComprehensiveIncomeNetOfTax"] },
    ],
  },
]

function pickFactUnits(
  fact:
    | {
        units?: Record<
          string,
          Array<{
            val?: number
            form?: string
            filed?: string
            end?: string
          }>
        >
      }
    | undefined,
) {
  if (!fact?.units) {
    return null
  }

  const unit = Object.keys(fact.units).find((key) => key === "USD") ?? Object.keys(fact.units)[0]
  const values = fact.units[unit]?.filter((value) => typeof value.val === "number" && value.end && value.filed) ?? []

  return values.length ? { unit, values } : null
}

function latestByForm(values: NonNullable<ReturnType<typeof pickFactUnits>>["values"], forms: string[]) {
  return values
    .filter((value) => forms.includes(value.form ?? ""))
    .sort((first, second) => `${second.end ?? ""}-${second.filed ?? ""}`.localeCompare(`${first.end ?? ""}-${first.filed ?? ""}`))[0]
}

function statementCandidateScore(
  annual: ReturnType<typeof latestByForm>,
  quarterly: ReturnType<typeof latestByForm>,
) {
  return [
    `${annual?.end ?? ""}-${annual?.filed ?? ""}`,
    `${quarterly?.end ?? ""}-${quarterly?.filed ?? ""}`,
  ].sort((first, second) => second.localeCompare(first))[0]
}

function buildFinancialStatements(companyFacts: CompanyFacts): FinancialStatement[] {
  const facts = companyFacts.facts?.["us-gaap"] ?? {}

  return statementDefinitions
    .map((statement): FinancialStatement => {
      const rows = statement.rows
        .map((definition): FinancialStatementLine | null => {
          const selected = definition.tags.reduce<{
            tag: string
            units: NonNullable<ReturnType<typeof pickFactUnits>>
            annual: ReturnType<typeof latestByForm>
            quarterly: ReturnType<typeof latestByForm>
            score: string
          } | null>((current, candidate) => {
            const units = pickFactUnits(facts[candidate])

            if (!units) {
              return current
            }

            const annual = latestByForm(units.values, ["10-K", "20-F", "40-F"])
            const quarterly = latestByForm(units.values, ["10-Q"])

            if (!annual && !quarterly) {
              return current
            }

            const next = {
              tag: candidate,
              units,
              annual,
              quarterly,
              score: statementCandidateScore(annual, quarterly),
            }

            return !current || next.score > current.score ? next : current
          }, null)

          if (!selected) {
            return null
          }

          return {
            label: definition.label,
            tag: selected.tag,
            unit: selected.units.unit,
            annual: selected.annual?.val,
            annualPeriod: selected.annual?.end,
            annualFiled: selected.annual?.filed,
            quarterly: selected.quarterly?.val,
            quarterlyPeriod: selected.quarterly?.end,
            quarterlyFiled: selected.quarterly?.filed,
          }
        })
        .filter((row): row is FinancialStatementLine => Boolean(row))

      return { title: statement.title, rows }
    })
    .filter((statement) => statement.rows.length)
}

async function fetchSecJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" })

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

export async function loadFilings(symbol: string, securities: Security[]): Promise<FilingsPayload> {
  const normalizedSymbol = normalizeSymbol(symbol)
  const updatedAt = new Date().toISOString()
  const security = securities.find((item) => item.symbol === normalizedSymbol)
  const cik = security?.cik
  const secSnapshot = await loadSecSnapshot()
  const snapshotCompany = secSnapshot?.companies?.[normalizedSymbol]

  if (snapshotCompany) {
    return snapshotCompany
  }

  if (!cik) {
    return {
      symbol: normalizedSymbol,
      filings: [],
      provider: "Fallback",
      message: "No CIK was found for this security in the S&P 500 dataset.",
      updatedAt,
    }
  }

  try {
    const [submissions, companyFacts] = await Promise.all([
      fetchSecJson<CompanySubmissions>(`https://data.sec.gov/submissions/CIK${cik}.json`),
      fetchSecJson<CompanyFacts>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`).catch(() => null),
    ])
    const recent = submissions.filings?.recent
    const forms = recent?.form ?? []
    const filings = forms
      .map((form, index): Filing | null => {
        if (form !== "10-K" && form !== "10-Q") {
          return null
        }

        const accessionNumber = recent?.accessionNumber?.[index]
        const primaryDocument = recent?.primaryDocument?.[index]

        if (!accessionNumber || !primaryDocument) {
          return null
        }

        const accessionNoDashes = accessionNumber.replaceAll("-", "")
        const cikNoLeadingZeroes = String(Number(cik))

        return {
          accessionNumber,
          form,
          filedAt: recent?.filingDate?.[index] ?? "",
          reportDate: recent?.reportDate?.[index],
          description: recent?.primaryDocDescription?.[index] || `${form} filing`,
          url: `https://www.sec.gov/Archives/edgar/data/${cikNoLeadingZeroes}/${accessionNoDashes}/${primaryDocument}`,
        }
      })
      .filter((filing): filing is Filing => Boolean(filing))
      .slice(0, 6)

    return {
      symbol: normalizedSymbol,
      cik,
      companyName: submissions.name || security?.name,
      filings,
      statements: companyFacts
        ? {
            source: "SEC CompanyFacts",
            statements: buildFinancialStatements(companyFacts),
          }
        : undefined,
      provider: "SEC EDGAR",
      message: companyFacts
        ? "Official SEC EDGAR submissions and XBRL financial statements loaded."
        : "Official SEC EDGAR filings loaded. CompanyFacts statements need SEC browser access or a server proxy.",
      updatedAt,
    }
  } catch {
    return {
      symbol: normalizedSymbol,
      cik,
      companyName: security?.name,
      filings: [],
      provider: "Fallback",
      message: "SEC EDGAR did not respond from the browser. Try again shortly.",
      updatedAt,
    }
  }
}
