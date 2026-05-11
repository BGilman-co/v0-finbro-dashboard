import { readFile } from "node:fs/promises"
import path from "node:path"

import { z } from "zod"

import { holdings, type Holding } from "@/lib/portfolio-data"
import type {
  Filing,
  FilingsPayload,
  FinancialStatement,
  FinancialStatementLine,
  MarketPayload,
  MarketQuote,
  OptionContract,
  PriceHistoryPayload,
  PriceHistoryPoint,
  PriceHistoryRange,
  Security,
  UniversePayload,
} from "@/lib/market-types"

const sp500CsvUrl = "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv"
const yahooQuoteUrl = "https://query1.finance.yahoo.com/v7/finance/quote"
const yahooChartBaseUrl = "https://query1.finance.yahoo.com/v8/finance/chart"
const liveQuoteBatchSize = 100
const liveChartQuoteLimit = 40

const securitySchema = z.object({
  symbol: z.string(),
  name: z.string(),
  sector: z.string(),
  industry: z.string().optional(),
  exchange: z.string().optional(),
  cik: z.string().optional(),
})

const marketQuoteSchema = z.object({
  symbol: z.string(),
  price: z.number(),
  previousClose: z.number(),
  change: z.number(),
  changePercent: z.number(),
  dayHigh: z.number().optional(),
  dayLow: z.number().optional(),
  volume: z.number().optional(),
  updatedAt: z.string(),
})

const optionContractSchema = z.object({
  contract: z.string(),
  type: z.enum(["call", "put"]),
  strike: z.number(),
  expiration: z.string().optional(),
  lastPrice: z.number().optional(),
  bid: z.number().optional(),
  ask: z.number().optional(),
  volume: z.number().optional(),
  openInterest: z.number().optional(),
  impliedVolatility: z.number().optional(),
})

const priceHistoryPointSchema = z.object({
  date: z.string(),
  label: z.string(),
  open: z.number().optional(),
  high: z.number().optional(),
  low: z.number().optional(),
  close: z.number(),
  volume: z.number().optional(),
})

const yfinanceSnapshotSchema = z.object({
  provider: z.string(),
  updatedAt: z.string(),
  universe: z.array(securitySchema),
  quotes: z.array(marketQuoteSchema),
  histories: z.record(z.string(), z.array(priceHistoryPointSchema)),
  options: z.record(z.string(), z.array(optionContractSchema)).optional(),
  message: z.string(),
})

type YfinanceSnapshot = z.infer<typeof yfinanceSnapshotSchema>

const secSnapshotSchema = z.object({
  provider: z.literal("SEC EDGAR"),
  updatedAt: z.string(),
  companies: z.record(z.string(), z.custom<FilingsPayload>()),
  message: z.string(),
})

type SecSnapshot = z.infer<typeof secSnapshotSchema>

const yahooQuoteResultSchema = z.object({
  symbol: z.string(),
  regularMarketPrice: z.number().optional(),
  regularMarketPreviousClose: z.number().optional(),
  regularMarketChange: z.number().optional(),
  regularMarketChangePercent: z.number().optional(),
  regularMarketDayHigh: z.number().optional(),
  regularMarketDayLow: z.number().optional(),
  regularMarketVolume: z.number().optional(),
  regularMarketTime: z.number().optional(),
})

const yahooQuoteResponseSchema = z.object({
  quoteResponse: z.object({
    result: z.array(yahooQuoteResultSchema),
  }),
})

type YahooQuoteResult = z.infer<typeof yahooQuoteResultSchema>

const yahooChartResponseSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({
            symbol: z.string(),
            regularMarketPrice: z.number().optional(),
            chartPreviousClose: z.number().optional(),
            previousClose: z.number().optional(),
            regularMarketDayHigh: z.number().optional(),
            regularMarketDayLow: z.number().optional(),
            regularMarketVolume: z.number().optional(),
            regularMarketTime: z.number().optional(),
            currency: z.string().optional(),
          }),
          timestamp: z.array(z.number()).nullable().optional(),
          indicators: z.object({
            quote: z
              .array(
                z.object({
                  open: z.array(z.number().nullable()).optional(),
                  high: z.array(z.number().nullable()).optional(),
                  low: z.array(z.number().nullable()).optional(),
                  close: z.array(z.number().nullable()).optional(),
                  volume: z.array(z.number().nullable()).optional(),
                }),
              )
              .optional(),
          }),
        }),
      )
      .nullable(),
  }),
})

const priceHistoryRangeConfig: Record<
  PriceHistoryRange,
  { range: string; interval: string; label: string; fallbackDays?: number; isAllTime?: boolean }
> = {
  "1w": { range: "7d", interval: "1h", label: "1 week", fallbackDays: 7 },
  "1m": { range: "1mo", interval: "1d", label: "1 month", fallbackDays: 31 },
  ytd: { range: "ytd", interval: "1d", label: "YTD" },
  "1y": { range: "1y", interval: "1wk", label: "1 year", fallbackDays: 366 },
  "5y": { range: "5y", interval: "1mo", label: "5 year", fallbackDays: 365 * 5 + 2 },
  "10y": { range: "10y", interval: "1mo", label: "10 year", fallbackDays: 365 * 10 + 3 },
  all: { range: "max", interval: "1mo", label: "all-time", isAllTime: true },
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

export function normalizeSymbol(symbol: string) {
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

async function loadJsonFromSource<T>(
  remoteUrl: string | undefined,
  localFileName: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  try {
    if (remoteUrl) {
      const response = await fetch(remoteUrl, { cache: "no-store" })

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`)
      }

      return schema.parse(await response.json())
    }

    const filePath = path.join(process.cwd(), "public", "data", localFileName)
    return schema.parse(JSON.parse(await readFile(filePath, "utf8")))
  } catch {
    return null
  }
}

async function loadYfinanceSnapshot() {
  return loadJsonFromSource<YfinanceSnapshot>(
    process.env.MARKET_SNAPSHOT_URL,
    "yfinance-snapshot.json",
    yfinanceSnapshotSchema,
  )
}

async function loadSecSnapshot() {
  return loadJsonFromSource<SecSnapshot>(process.env.SEC_SNAPSHOT_URL, "sec-snapshot.json", secSnapshotSchema)
}

function chunkSymbols(symbols: string[]) {
  const chunks: string[][] = []

  for (let index = 0; index < symbols.length; index += liveQuoteBatchSize) {
    chunks.push(symbols.slice(index, index + liveQuoteBatchSize))
  }

  return chunks
}

function yahooSymbol(symbol: string) {
  return normalizeSymbol(symbol)
}

function toMarketQuote(result: YahooQuoteResult, fallback?: MarketQuote): MarketQuote | null {
  const symbol = normalizeSymbol(result.symbol)
  const price = result.regularMarketPrice ?? fallback?.price
  const previousClose = result.regularMarketPreviousClose ?? fallback?.previousClose ?? price

  if (price === undefined || previousClose === undefined) {
    return null
  }

  const change = result.regularMarketChange ?? price - previousClose
  const changePercent =
    result.regularMarketChangePercent ?? (previousClose === 0 ? 0 : (change / previousClose) * 100)
  const updatedAt = result.regularMarketTime
    ? new Date(result.regularMarketTime * 1000).toISOString()
    : new Date().toISOString()

  return {
    symbol,
    price,
    previousClose,
    change,
    changePercent,
    dayHigh: result.regularMarketDayHigh ?? fallback?.dayHigh,
    dayLow: result.regularMarketDayLow ?? fallback?.dayLow,
    volume: result.regularMarketVolume ?? fallback?.volume,
    updatedAt,
  }
}

async function loadLiveQuotes(symbols: string[], fallbackQuotes: MarketQuote[]) {
  const fallbackMap = new Map(fallbackQuotes.map((quote) => [quote.symbol, quote]))
  const liveQuotes: MarketQuote[] = []

  for (const batch of chunkSymbols(symbols)) {
    const url = new URL(yahooQuoteUrl)
    url.searchParams.set("symbols", batch.map(yahooSymbol).join(","))

    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "B-Gilman-Co-Dashboard/1.0",
      },
    })

    if (!response.ok) {
      throw new Error(`Yahoo Finance quote request failed with ${response.status}`)
    }

    const parsed = yahooQuoteResponseSchema.parse(await response.json())

    for (const result of parsed.quoteResponse.result) {
      const quote = toMarketQuote(result, fallbackMap.get(normalizeSymbol(result.symbol)))

      if (quote) {
        liveQuotes.push(quote)
      }
    }
  }

  return liveQuotes
}

async function loadLiveChartQuote(symbol: string, fallback?: MarketQuote) {
  const url = new URL(`${yahooChartBaseUrl}/${encodeURIComponent(yahooSymbol(symbol))}`)
  url.searchParams.set("range", "1d")
  url.searchParams.set("interval", "1m")

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
    },
  })

  if (!response.ok) {
    return null
  }

  const parsed = yahooChartResponseSchema.safeParse(await response.json())
  const meta = parsed.success ? parsed.data.chart.result?.[0]?.meta : null

  if (!meta) {
    return null
  }

  return toMarketQuote(
    {
      symbol: meta.symbol,
      regularMarketPrice: meta.regularMarketPrice,
      regularMarketPreviousClose: meta.previousClose ?? meta.chartPreviousClose,
      regularMarketDayHigh: meta.regularMarketDayHigh,
      regularMarketDayLow: meta.regularMarketDayLow,
      regularMarketVolume: meta.regularMarketVolume,
      regularMarketTime: meta.regularMarketTime,
    },
    fallback,
  )
}

async function loadLiveChartQuotes(symbols: string[], fallbackQuotes: MarketQuote[]) {
  const fallbackMap = new Map(fallbackQuotes.map((quote) => [quote.symbol, quote]))
  const limitedSymbols = symbols.slice(0, liveChartQuoteLimit)
  const quotes = await Promise.all(
    limitedSymbols.map((symbol) => loadLiveChartQuote(symbol, fallbackMap.get(symbol)).catch(() => null)),
  )

  return quotes.filter((quote): quote is MarketQuote => Boolean(quote))
}

async function loadBestLiveQuotes(symbols: string[], fallbackQuotes: MarketQuote[]) {
  try {
    const liveQuotes = await loadLiveQuotes(symbols, fallbackQuotes)

    if (liveQuotes.length) {
      return liveQuotes
    }
  } catch {
    // Yahoo's multi-quote endpoint can reject unauthenticated requests; chart quotes are the live fallback.
  }

  return loadLiveChartQuotes(symbols, fallbackQuotes)
}

function toHistoryLabel(date: Date, interval: string) {
  if (interval === "1h") {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
    }).format(date)
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date)
}

function toPriceHistoryPoint(timestampSeconds: number, quote: {
  open?: Array<number | null>
  high?: Array<number | null>
  low?: Array<number | null>
  close?: Array<number | null>
  volume?: Array<number | null>
}, index: number, interval: string): PriceHistoryPoint | null {
  const close = quote.close?.[index]

  if (close === null || close === undefined) {
    return null
  }

  const date = new Date(timestampSeconds * 1000)

  return {
    date: date.toISOString(),
    label: toHistoryLabel(date, interval),
    open: quote.open?.[index] ?? undefined,
    high: quote.high?.[index] ?? undefined,
    low: quote.low?.[index] ?? undefined,
    close,
    volume: quote.volume?.[index] ?? undefined,
  }
}

function filterFallbackHistory(points: PriceHistoryPoint[], range: PriceHistoryRange) {
  const config = priceHistoryRangeConfig[range]

  if (config.isAllTime || points.length === 0) {
    return points
  }

  if (range === "ytd") {
    const currentYear = new Date().getUTCFullYear()
    return points.filter((point) => new Date(point.date).getUTCFullYear() === currentYear)
  }

  if (!config.fallbackDays) {
    return points
  }

  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - config.fallbackDays)

  return points.filter((point) => new Date(point.date) >= cutoff)
}

async function loadLivePriceHistory(symbol: string, range: PriceHistoryRange) {
  const config = priceHistoryRangeConfig[range]
  const url = new URL(`${yahooChartBaseUrl}/${encodeURIComponent(yahooSymbol(symbol))}`)
  url.searchParams.set("range", config.range)
  url.searchParams.set("interval", config.interval)
  url.searchParams.set("includePrePost", "false")

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
    },
  })

  if (!response.ok) {
    return null
  }

  const parsed = yahooChartResponseSchema.safeParse(await response.json())
  const result = parsed.success ? parsed.data.chart.result?.[0] : null
  const quote = result?.indicators.quote?.[0]
  const timestamps = result?.timestamp ?? []

  if (!result || !quote || !timestamps.length) {
    return null
  }

  const points = timestamps
    .map((timestamp, index) => toPriceHistoryPoint(timestamp, quote, index, config.interval))
    .filter((point): point is PriceHistoryPoint => Boolean(point))

  if (!points.length) {
    return null
  }

  return {
    points,
    provider: "Yahoo Finance live chart",
    message: `${points.length} ${config.label} price records loaded live from Yahoo Finance.`,
    updatedAt: new Date().toISOString(),
  }
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
    const response = await fetch(sp500CsvUrl, {
      cache: "no-store",
      headers: { "User-Agent": "B Gilman Financial Dashboard" },
    })

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
  const liveRefreshSymbols = Array.from(new Set([selectedOptionSymbol, ...normalizedSymbols]))
  const updatedAt = new Date().toISOString()
  const snapshot = await loadYfinanceSnapshot()
  const requestedSymbols = new Set(normalizedSymbols)
  const snapshotQuotes = snapshot?.quotes.filter((quote) => requestedSymbols.has(quote.symbol)) ?? []

  if (!snapshot) {
    try {
      const liveQuotes = await loadBestLiveQuotes(liveRefreshSymbols, [])

      return {
        quotes: liveQuotes,
        options: [],
        provider: "Yahoo Finance live quotes",
        isLive: liveQuotes.length > 0,
        message: `${liveQuotes.length} live quote records loaded by the API.`,
        updatedAt,
      }
    } catch {
      return {
        quotes: [],
        options: [],
        provider: "Yahoo Finance",
        isLive: false,
        message:
          "No market snapshot was found and live quotes were unavailable. Configure MARKET_SNAPSHOT_URL in Vercel or deploy with public/data/yfinance-snapshot.json.",
        updatedAt,
      }
    }
  }

  try {
    const liveQuotes = await loadBestLiveQuotes(liveRefreshSymbols, snapshotQuotes)
    const liveQuoteMap = new Map(liveQuotes.map((quote) => [quote.symbol, quote]))
    const quotes = normalizedSymbols
      .map((symbol) => liveQuoteMap.get(symbol) ?? snapshotQuotes.find((quote) => quote.symbol === symbol))
      .filter((quote): quote is MarketQuote => Boolean(quote))

    return {
      quotes,
      options: snapshot.options?.[selectedOptionSymbol] ?? [],
      provider: "Yahoo Finance live quotes",
      isLive: liveQuotes.length > 0,
      message: `${liveQuotes.length} live quote records loaded by the API; snapshot data fills any missing tickers.`,
      updatedAt,
    }
  } catch {
    return {
      quotes: snapshotQuotes,
      options: snapshot.options?.[selectedOptionSymbol] ?? [],
      provider: snapshot.provider,
      isLive: false,
      message: `${snapshotQuotes.length} S&P 500 quote records loaded from the latest yfinance snapshot because live quotes were unavailable.`,
      updatedAt: snapshot.updatedAt,
    }
  }
}

export async function loadPriceHistory(symbol: string, range: PriceHistoryRange): Promise<PriceHistoryPayload> {
  const normalizedSymbol = normalizeSymbol(symbol)
  const updatedAt = new Date().toISOString()
  const liveHistory = await loadLivePriceHistory(normalizedSymbol, range).catch(() => null)

  if (liveHistory) {
    return {
      symbol: normalizedSymbol,
      range,
      points: liveHistory.points,
      provider: liveHistory.provider,
      message: liveHistory.message,
      updatedAt: liveHistory.updatedAt,
    }
  }

  const snapshot = await loadYfinanceSnapshot()
  const snapshotPoints = snapshot?.histories?.[normalizedSymbol] ?? []
  const points = filterFallbackHistory(snapshotPoints, range)
  const rangeLabel = priceHistoryRangeConfig[range].label

  return {
    symbol: normalizedSymbol,
    range,
    points,
    provider: snapshot?.provider ?? "yfinance / Yahoo Finance",
    message: points.length
      ? `${points.length} ${rangeLabel} price records loaded from the snapshot fallback.`
      : `No ${rangeLabel} price history was found for this ticker.`,
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
      {
        label: "Income Before Taxes",
        tags: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"],
      },
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
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "B Gilman Financial Dashboard contact@bgilman.co" },
  })

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

export async function loadFilings(symbol: string): Promise<FilingsPayload> {
  const normalizedSymbol = normalizeSymbol(symbol)
  const updatedAt = new Date().toISOString()
  const secSnapshot = await loadSecSnapshot()
  const snapshotCompany = secSnapshot?.companies?.[normalizedSymbol]

  if (snapshotCompany) {
    return snapshotCompany
  }

  const universe = await loadSp500Universe()
  const security = universe.securities.find((item) => item.symbol === normalizedSymbol)
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
        ? "Official SEC EDGAR submissions and XBRL financial statements loaded by the Vercel API."
        : "Official SEC EDGAR filings loaded. CompanyFacts statements were unavailable.",
      updatedAt,
    }
  } catch {
    return {
      symbol: normalizedSymbol,
      cik,
      companyName: security?.name,
      filings: [],
      provider: "Fallback",
      message: "SEC EDGAR did not respond. Try again shortly.",
      updatedAt,
    }
  }
}
