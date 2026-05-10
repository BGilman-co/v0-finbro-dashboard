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
  PriceHistoryPoint,
  Security,
} from "@/lib/market-types"

const alphaKey = process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY
const sp500CsvUrl = "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv"

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

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

export async function loadSp500Universe(): Promise<UniversePayload> {
  const updatedAt = new Date().toISOString()

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

type AlphaBulkQuote = {
  symbol?: string
  price?: string
  previous_close?: string
  change?: string
  change_percent?: string
  volume?: string
  timestamp?: string
}

type AlphaBulkQuoteResponse = {
  data?: AlphaBulkQuote[]
  Information?: string
  Note?: string
  "Error Message"?: string
}

type AlphaQuoteResponse = {
  "Global Quote"?: {
    "01. symbol"?: string
    "05. price"?: string
    "06. volume"?: string
    "08. previous close"?: string
    "09. change"?: string
    "10. change percent"?: string
  }
  Information?: string
  Note?: string
  "Error Message"?: string
}

function providerMessage(data: AlphaBulkQuoteResponse | AlphaQuoteResponse) {
  return sanitizeProviderMessage(data.Information ?? data.Note ?? data["Error Message"] ?? "")
}

function sanitizeProviderMessage(message: string) {
  if (/rate limit|premium plans|25 requests per day|Thank you for using Alpha Vantage/i.test(message)) {
    return "Alpha Vantage rate limit or plan access blocked the request."
  }

  return message
}

function normalizeAlphaBulkQuote(quote: AlphaBulkQuote): MarketQuote | null {
  const symbol = quote.symbol ? normalizeSymbol(quote.symbol) : ""
  const price = Number(quote.price)
  const previousClose = Number(quote.previous_close)

  if (!symbol || !Number.isFinite(price) || !Number.isFinite(previousClose)) {
    return null
  }

  const change = Number(quote.change) || price - previousClose

  return {
    symbol,
    price,
    previousClose,
    change,
    changePercent: Number.parseFloat(quote.change_percent ?? "") || (previousClose === 0 ? 0 : (change / previousClose) * 100),
    volume: Number(quote.volume) || undefined,
    updatedAt: quote.timestamp ? new Date(quote.timestamp).toISOString() : new Date().toISOString(),
  }
}

function normalizeAlphaQuote(symbol: string, data: AlphaQuoteResponse): MarketQuote | null {
  const quote = data["Global Quote"]
  const price = Number(quote?.["05. price"])
  const previousClose = Number(quote?.["08. previous close"])

  if (!Number.isFinite(price) || !Number.isFinite(previousClose)) {
    return null
  }

  const change = Number(quote?.["09. change"]) || price - previousClose

  return {
    symbol: normalizeSymbol(quote?.["01. symbol"] ?? symbol),
    price,
    previousClose,
    change,
    changePercent: Number.parseFloat(quote?.["10. change percent"] ?? "") || (previousClose === 0 ? 0 : (change / previousClose) * 100),
    volume: Number(quote?.["06. volume"]) || undefined,
    updatedAt: new Date().toISOString(),
  }
}

async function fetchAlphaJson<T>(params: Record<string, string>): Promise<T> {
  if (!alphaKey) {
    throw new Error("NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY is not configured.")
  }

  const searchParams = new URLSearchParams({ ...params, apikey: alphaKey })
  const response = await fetch(`https://www.alphavantage.co/query?${searchParams.toString()}`, { cache: "no-store" })

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

async function fetchAlphaBulkQuotes(symbols: string[]): Promise<MarketQuote[]> {
  const quotes: MarketQuote[] = []
  let message = ""
  const chunks = Array.from({ length: Math.ceil(symbols.length / 100) }, (_, index) =>
    symbols.slice(index * 100, index * 100 + 100),
  )

  for (const chunk of chunks) {
    const data = await fetchAlphaJson<AlphaBulkQuoteResponse>({
      function: "REALTIME_BULK_QUOTES",
      symbol: chunk.join(","),
    })
    message = providerMessage(data) || message
    quotes.push(...(data.data ?? []).map(normalizeAlphaBulkQuote).filter((quote): quote is MarketQuote => Boolean(quote)))
  }

  if (!quotes.length) {
    throw new Error(message || "Alpha Vantage returned no usable bulk quotes.")
  }

  return quotes
}

async function fetchAlphaQuote(symbol: string): Promise<MarketQuote> {
  const data = await fetchAlphaJson<AlphaQuoteResponse>({
    function: "GLOBAL_QUOTE",
    symbol,
  })
  const quote = normalizeAlphaQuote(symbol, data)

  if (!quote) {
    throw new Error(providerMessage(data) || `Alpha Vantage returned no usable quote for ${symbol}.`)
  }

  return quote
}

type AlphaOptionsResponse = {
  data?: Array<{
    contractID?: string
    type?: string
    strike?: string
    expiration?: string
    last?: string
    bid?: string
    ask?: string
    volume?: string
    open_interest?: string
    implied_volatility?: string
  }>
}

async function fetchAlphaOptions(symbol: string): Promise<OptionContract[]> {
  const data = await fetchAlphaJson<AlphaOptionsResponse>({
    function: "HISTORICAL_OPTIONS",
    symbol,
  })

  return (data.data ?? [])
    .map((option): OptionContract | null => {
      const strike = Number(option.strike)
      const type = option.type === "call" || option.type === "put" ? option.type : null

      if (!option.contractID || !type || !Number.isFinite(strike)) {
        return null
      }

      return {
        contract: option.contractID,
        type,
        strike,
        expiration: option.expiration,
        lastPrice: Number(option.last) || undefined,
        bid: Number(option.bid) || undefined,
        ask: Number(option.ask) || undefined,
        volume: Number(option.volume) || undefined,
        openInterest: Number(option.open_interest) || undefined,
        impliedVolatility: Number(option.implied_volatility) || undefined,
      }
    })
    .filter((option): option is OptionContract => Boolean(option))
    .sort((first, second) => (second.volume ?? 0) - (first.volume ?? 0))
    .slice(0, 8)
}

export async function loadMarketData(symbols: string[], optionSymbol: string): Promise<MarketPayload> {
  const normalizedSymbols = symbols.map(normalizeSymbol).filter(Boolean)
  const selectedOptionSymbol = normalizeSymbol(optionSymbol || normalizedSymbols[0] || "AAPL")
  const updatedAt = new Date().toISOString()

  if (!alphaKey) {
    return {
      quotes: [],
      options: [],
      provider: "Alpha Vantage",
      isLive: false,
      message: "GitHub Pages needs NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY to load browser-side live prices.",
      updatedAt,
    }
  }

  try {
    const quotes = await fetchAlphaBulkQuotes(normalizedSymbols)
    const options = await fetchAlphaOptions(selectedOptionSymbol).catch(() => [])

    return {
      quotes,
      options,
      provider: "Alpha Vantage",
      isLive: true,
      message: `${quotes.length} live/delayed quote records loaded from Alpha Vantage. Options appear when the key has options access.`,
      updatedAt,
    }
  } catch (bulkError) {
    const quote = await fetchAlphaQuote(selectedOptionSymbol).catch(() => null)
    const quotes = quote ? [quote] : []
    const options = await fetchAlphaOptions(selectedOptionSymbol).catch(() => [])
    const message = bulkError instanceof Error ? bulkError.message : "Alpha Vantage bulk quotes were unavailable."

    return {
      quotes,
      options,
      provider: "Alpha Vantage",
      isLive: quotes.length > 0,
      message: quotes.length
        ? `Selected ticker quote loaded. Full S&P 500 bulk access was unavailable: ${message}`
        : `No quote data loaded. ${message}`,
      updatedAt,
    }
  }
}

type AlphaDailyResponse = {
  "Time Series (Daily)"?: Record<
    string,
    {
      "1. open"?: string
      "2. high"?: string
      "3. low"?: string
      "4. close"?: string
      "5. volume"?: string
    }
  >
  Information?: string
  Note?: string
  "Error Message"?: string
}

export async function loadPriceHistory(symbol: string): Promise<PriceHistoryPayload> {
  const normalizedSymbol = normalizeSymbol(symbol)
  const updatedAt = new Date().toISOString()

  if (!alphaKey) {
    return {
      symbol: normalizedSymbol,
      points: [],
      provider: "Alpha Vantage",
      message: "Add NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY to load the price movement graph on GitHub Pages.",
      updatedAt,
    }
  }

  try {
    const data = await fetchAlphaJson<AlphaDailyResponse>({
      function: "TIME_SERIES_DAILY",
      symbol: normalizedSymbol,
      outputsize: "compact",
    })
    const series = data["Time Series (Daily)"]

    if (!series) {
      throw new Error(providerMessage(data) || "Alpha Vantage returned no history.")
    }

    const points: PriceHistoryPoint[] = Object.entries(series)
      .flatMap(([date, row]) => {
        const close = Number(row["4. close"])

        if (!Number.isFinite(close)) {
          return []
        }

        return [{
          date,
          label: new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          open: Number(row["1. open"]) || undefined,
          high: Number(row["2. high"]) || undefined,
          low: Number(row["3. low"]) || undefined,
          close,
          volume: Number(row["5. volume"]) || undefined,
        }]
      })
      .sort((first, second) => first.date.localeCompare(second.date))

    return {
      symbol: normalizedSymbol,
      points,
      provider: "Alpha Vantage",
      message: `${points.length} daily price records loaded.`,
      updatedAt,
    }
  } catch (error) {
    return {
      symbol: normalizedSymbol,
      points: [],
      provider: "Alpha Vantage",
      message: error instanceof Error ? error.message : "Historical price data is unavailable.",
      updatedAt,
    }
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

function buildFinancialStatements(companyFacts: CompanyFacts): FinancialStatement[] {
  const facts = companyFacts.facts?.["us-gaap"] ?? {}

  return statementDefinitions
    .map((statement): FinancialStatement => {
      const rows = statement.rows
        .map((definition): FinancialStatementLine | null => {
          const tag = definition.tags.find((candidate) => pickFactUnits(facts[candidate]))
          const units = tag ? pickFactUnits(facts[tag]) : null

          if (!tag || !units) {
            return null
          }

          const annual = latestByForm(units.values, ["10-K", "20-F", "40-F"])
          const quarterly = latestByForm(units.values, ["10-Q"])

          if (!annual && !quarterly) {
            return null
          }

          return {
            label: definition.label,
            tag,
            unit: units.unit,
            annual: annual?.val,
            annualPeriod: annual?.end,
            annualFiled: annual?.filed,
            quarterly: quarterly?.val,
            quarterlyPeriod: quarterly?.end,
            quarterlyFiled: quarterly?.filed,
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
