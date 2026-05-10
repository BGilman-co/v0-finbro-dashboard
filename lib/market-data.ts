import https from "node:https"
import { holdings, getLatestPrice, getPreviousClose, type Holding } from "@/lib/portfolio-data"
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

const yahooHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
}

const secHeaders = {
  "User-Agent": process.env.SEC_USER_AGENT ?? "Financial_Model/0.1 contact@example.com",
  Accept: "application/json",
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function fallbackQuote(holding: Holding): MarketQuote {
  const price = getLatestPrice(holding)
  const previousClose = getPreviousClose(holding)
  const change = price - previousClose

  return {
    symbol: holding.id,
    price,
    previousClose,
    change,
    changePercent: previousClose === 0 ? 0 : (change / previousClose) * 100,
    updatedAt: new Date().toISOString(),
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

function fetchTextWithHttps(url: string, headers: Record<string, string> = {}) {
  return new Promise<string>((resolve, reject) => {
    https
      .get(url, { headers }, (response) => {
        let body = ""

        response.setEncoding("utf8")
        response.on("data", (chunk) => {
          body += chunk
        })
        response.on("end", () => {
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`${response.statusCode ?? 0} ${response.statusMessage ?? "Request failed"}`))
            return
          }

          resolve(body)
        })
      })
      .on("error", reject)
  })
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&#160;", " ")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .trim()
}

function stripTags(value: string) {
  return decodeHtml(value.replace(/<sup[\s\S]*?<\/sup>/gi, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " "))
}

export async function getSp500Universe(): Promise<Security[]> {
  try {
    const html = await fetch("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies", {
      cache: "no-store",
      headers: {
        "User-Agent": "Financial_Model/0.1",
      },
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`)
      }

      return response.text()
    })
    const table = html.match(/<table[^>]+id="constituents"[\s\S]*?<\/table>/i)?.[0]

    if (!table) {
      throw new Error("S&P 500 constituents table was not found")
    }

    const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)]
      .slice(1)
      .map((row): Security | null => {
        const cells = [...row[0].matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map((cell) => stripTags(cell[1]))
        const [symbol, name, sector, industry] = cells

        if (!symbol || !name) {
          return null
        }

        return {
          symbol: symbol.replace(".", "-").toUpperCase(),
          name,
          sector: sector || "Unclassified",
          industry,
          exchange: "US",
        }
      })
      .filter((security): security is Security => Boolean(security))

    if (rows.length < 400) {
      throw new Error("S&P 500 parse returned too few rows")
    }

    return rows
  } catch {
    return holdings.map((holding) => ({
      symbol: holding.id,
      name: holding.name,
      sector: holding.sector,
      exchange: holding.exchange,
    }))
  }
}

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number
        previousClose?: number
        chartPreviousClose?: number
        regularMarketDayHigh?: number
        regularMarketDayLow?: number
        regularMarketVolume?: number
        regularMarketTime?: number
      }
      timestamp?: number[]
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>
          high?: Array<number | null>
          low?: Array<number | null>
          close?: Array<number | null>
          volume?: Array<number | null>
        }>
      }
    }>
    error?: unknown
  }
}

function sanitizeProviderMessage(message: string) {
  const sanitized = message
    .replace(/API key as [A-Za-z0-9_-]+/gi, "API key")
    .replace(/apikey=[A-Za-z0-9_-]+/gi, "apikey=REDACTED")

  if (/rate limit|premium plans/i.test(sanitized)) {
    return "provider rate limit reached"
  }

  return sanitized
}

async function fetchYahooQuote(symbol: string): Promise<MarketQuote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?range=1d&interval=5m`
  const data = await fetchJson<YahooChartResponse>(url, { headers: yahooHeaders })
  const result = data.chart?.result?.[0]
  const meta = result?.meta
  const closes = result?.indicators?.quote?.[0]?.close ?? []
  const latestClose = [...closes].reverse().find((close) => typeof close === "number")
  const price = asNumber(meta?.regularMarketPrice) ?? asNumber(latestClose)
  const previousClose = asNumber(meta?.previousClose) ?? asNumber(meta?.chartPreviousClose)

  if (!price || !previousClose) {
    throw new Error("Yahoo response did not include a usable price")
  }

  const change = price - previousClose

  return {
    symbol: symbol.toUpperCase(),
    price,
    previousClose,
    change,
    changePercent: (change / previousClose) * 100,
    dayHigh: asNumber(meta?.regularMarketDayHigh),
    dayLow: asNumber(meta?.regularMarketDayLow),
    volume: asNumber(meta?.regularMarketVolume),
    updatedAt: meta?.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString(),
  }
}

async function fetchYahooHistory(symbol: string): Promise<PriceHistoryPoint[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?range=6mo&interval=1d`
  const data = JSON.parse(await fetchTextWithHttps(url, { "User-Agent": "Mozilla/5.0" })) as YahooChartResponse
  const result = data.chart?.result?.[0]
  const timestamps = result?.timestamp ?? []
  const quote = result?.indicators?.quote?.[0]
  const closes = quote?.close ?? []
  const opens = quote?.open ?? []
  const highs = quote?.high ?? []
  const lows = quote?.low ?? []
  const volumes = quote?.volume ?? []
  const points = timestamps.flatMap((timestamp, index): PriceHistoryPoint[] => {
    const close = closes[index]

    if (typeof close !== "number") {
      return []
    }

    const date = new Date(timestamp * 1000)

    return [
      {
        date: date.toISOString().slice(0, 10),
        label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        open: typeof opens[index] === "number" ? opens[index] ?? undefined : undefined,
        high: typeof highs[index] === "number" ? highs[index] ?? undefined : undefined,
        low: typeof lows[index] === "number" ? lows[index] ?? undefined : undefined,
        close,
        volume: typeof volumes[index] === "number" ? volumes[index] ?? undefined : undefined,
      },
    ]
  })

  if (!points.length) {
    throw new Error("Yahoo Finance returned no usable history")
  }

  return points
}

type YahooOptionsResponse = {
  optionChain?: {
    result?: Array<{
      options?: Array<{
        expirationDate?: number
        calls?: YahooOption[]
        puts?: YahooOption[]
      }>
    }>
  }
}

type YahooOption = {
  contractSymbol?: string
  strike?: number
  lastPrice?: number
  bid?: number
  ask?: number
  volume?: number
  openInterest?: number
  impliedVolatility?: number
}

function normalizeYahooOption(option: YahooOption, type: "call" | "put", expiration?: number): OptionContract | null {
  if (!option.contractSymbol || typeof option.strike !== "number") {
    return null
  }

  return {
    contract: option.contractSymbol,
    type,
    strike: option.strike,
    expiration: expiration ? new Date(expiration * 1000).toISOString().slice(0, 10) : undefined,
    lastPrice: asNumber(option.lastPrice),
    bid: asNumber(option.bid),
    ask: asNumber(option.ask),
    volume: asNumber(option.volume),
    openInterest: asNumber(option.openInterest),
    impliedVolatility: asNumber(option.impliedVolatility),
  }
}

async function fetchYahooOptions(symbol: string): Promise<OptionContract[]> {
  const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`
  const data = await fetchJson<YahooOptionsResponse>(url, { headers: yahooHeaders })
  const chain = data.optionChain?.result?.[0]?.options?.[0]
  const contracts = [
    ...(chain?.calls ?? []).map((option) => normalizeYahooOption(option, "call", chain?.expirationDate)),
    ...(chain?.puts ?? []).map((option) => normalizeYahooOption(option, "put", chain?.expirationDate)),
  ].filter((option): option is OptionContract => Boolean(option))

  return contracts
    .sort((first, second) => (second.volume ?? 0) - (first.volume ?? 0))
    .slice(0, 8)
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

function normalizeStooqSymbol(symbol: string) {
  return symbol.replace(/\.US$/i, "").toUpperCase()
}

async function fetchStooqQuotes(symbols: string[]): Promise<MarketQuote[]> {
  const chunks = Array.from({ length: Math.ceil(symbols.length / 100) }, (_, index) =>
    symbols.slice(index * 100, index * 100 + 100),
  )
  const quotes: MarketQuote[] = []

  for (const chunk of chunks) {
    const stooqSymbols = chunk.map((symbol) => `${symbol.toLowerCase()}.us`).join("+")
    const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbols).replaceAll("%2B", "+")}&f=sd2t2ohlcvp&h&e=csv`
    const csv = await fetch(url, {
      cache: "no-store",
      headers: {
        "User-Agent": "Financial_Model/0.1",
      },
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`)
      }

      return response.text()
    })
    const rows = csv.trim().split(/\r?\n/).slice(1)

    for (const row of rows) {
      const [rawSymbol, date, time, open, high, low, close, volume, previousClose] = parseCsvLine(row)
      const price = Number(close)
      const prev = Number(previousClose)

      if (!rawSymbol || date === "N/D" || !Number.isFinite(price) || !Number.isFinite(prev)) {
        continue
      }

      const change = price - prev

      quotes.push({
        symbol: normalizeStooqSymbol(rawSymbol),
        price,
        previousClose: prev,
        change,
        changePercent: prev === 0 ? 0 : (change / prev) * 100,
        dayHigh: Number(high) || undefined,
        dayLow: Number(low) || undefined,
        volume: Number(volume) || undefined,
        updatedAt: date && time && time !== "N/D" ? new Date(`${date}T${time}`).toISOString() : new Date().toISOString(),
      })
    }
  }

  if (!quotes.length) {
    throw new Error("Stooq returned no usable quotes")
  }

  return quotes
}

type AlphaQuoteResponse = {
  "Global Quote"?: {
    "01. symbol"?: string
    "05. price"?: string
    "08. previous close"?: string
    "09. change"?: string
    "10. change percent"?: string
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
}

type FactSetCredentials = {
  username: string
  apiKey: string
}

type FactSetPriceNode = {
  price?: number
  time?: string
  tradingVolume?: number
  performance?: {
    absolute?: number
    relative?: number
  }
}

type FactSetPriceRow = {
  idNotation?: string
  sourceIdentifier?: string
  latest?: FactSetPriceNode
  high?: FactSetPriceNode
  low?: FactSetPriceNode
  previousClose?: FactSetPriceNode
  accumulated?: {
    tradingVolume?: number
  }
  status?: {
    code?: string
    details?: string
  }
}

type FactSetPricesResponse = {
  data?: FactSetPriceRow[]
}

function getFactSetCredentials(): FactSetCredentials | null {
  const username = process.env.FACTSET_USERNAME?.trim()
  const apiKey = process.env.FACTSET_API_KEY?.trim()

  if (!username || !apiKey) {
    return null
  }

  return { username, apiKey }
}

function getFactSetHeaders(credentials: FactSetCredentials) {
  return {
    Accept: "application/json",
    Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.apiKey}`).toString("base64")}`,
  }
}

function toFactSetIdentifier(symbol: string) {
  const normalized = symbol.replace(".", "-").toUpperCase()
  const suffix = process.env.FACTSET_SYMBOL_SUFFIX ?? "-US"

  return normalized.includes("-") ? normalized : `${normalized}${suffix}`
}

function fromFactSetIdentifier(identifier: string) {
  const suffix = process.env.FACTSET_SYMBOL_SUFFIX ?? "-US"

  return identifier.toUpperCase().endsWith(suffix.toUpperCase())
    ? identifier.slice(0, -suffix.length).toUpperCase()
    : identifier.toUpperCase()
}

function normalizeFactSetQuote(quote: FactSetPriceRow): MarketQuote | null {
  const sourceIdentifier = quote.sourceIdentifier ?? quote.idNotation
  const price = asNumber(quote.latest?.price)
  const previousClose = asNumber(quote.previousClose?.price)

  if (!sourceIdentifier || !price || !previousClose) {
    return null
  }

  const change = asNumber(quote.latest?.performance?.absolute) ?? price - previousClose

  return {
    symbol: fromFactSetIdentifier(sourceIdentifier),
    price,
    previousClose,
    change,
    changePercent: asNumber(quote.latest?.performance?.relative) ?? (change / previousClose) * 100,
    dayHigh: asNumber(quote.high?.price),
    dayLow: asNumber(quote.low?.price),
    volume: asNumber(quote.accumulated?.tradingVolume) ?? asNumber(quote.latest?.tradingVolume),
    updatedAt: quote.latest?.time ? new Date(quote.latest.time).toISOString() : new Date().toISOString(),
  }
}

async function fetchFactSetQuotes(symbols: string[], credentials: FactSetCredentials): Promise<MarketQuote[]> {
  const identifierType = process.env.FACTSET_IDENTIFIER_TYPE ?? "tickerRegion"
  const quality = process.env.FACTSET_QUOTE_QUALITY ?? "DLY"
  const chunks = Array.from({ length: Math.ceil(symbols.length / 50) }, (_, index) =>
    symbols.slice(index * 50, index * 50 + 50),
  )
  const quotes: MarketQuote[] = []

  for (const chunk of chunks) {
    const params = new URLSearchParams({
      identifiers: chunk.map(toFactSetIdentifier).join(","),
      identifierType,
      quality,
      sameQuality: "true",
      _attributes: "sourceIdentifier,latest,previousClose,high,low,accumulated,status",
    })
    const url = `https://api.factset.com/wealth/v3/prices/list?${params.toString()}`
    const data = await fetchJson<FactSetPricesResponse>(url, {
      headers: getFactSetHeaders(credentials),
    })
    const chunkQuotes = (data.data ?? [])
      .map(normalizeFactSetQuote)
      .filter((quote): quote is MarketQuote => Boolean(quote))

    quotes.push(...chunkQuotes)
  }

  if (!quotes.length) {
    throw new Error("FactSet returned no usable quotes. Check entitlements, identifier type, and symbol suffix.")
  }

  return quotes
}

function normalizeAlphaBulkQuote(quote: AlphaBulkQuote): MarketQuote | null {
  const symbol = quote.symbol?.toUpperCase()
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
    changePercent: Number.parseFloat(quote.change_percent ?? "") || (change / previousClose) * 100,
    volume: Number(quote.volume) || undefined,
    updatedAt: quote.timestamp ? new Date(quote.timestamp).toISOString() : new Date().toISOString(),
  }
}

async function fetchAlphaBulkQuotes(symbols: string[], apiKey: string): Promise<MarketQuote[]> {
  const chunks = Array.from({ length: Math.ceil(symbols.length / 100) }, (_, index) =>
    symbols.slice(index * 100, index * 100 + 100),
  )
  const quotes: MarketQuote[] = []
  let providerMessage = ""

  for (const chunk of chunks) {
    const url = `https://www.alphavantage.co/query?function=REALTIME_BULK_QUOTES&symbol=${encodeURIComponent(
      chunk.join(","),
    )}&apikey=${encodeURIComponent(apiKey)}`
    const data = await fetchJson<AlphaBulkQuoteResponse>(url)
    const chunkQuotes = (data.data ?? [])
      .map(normalizeAlphaBulkQuote)
      .filter((quote): quote is MarketQuote => Boolean(quote))

    if (data.Information || data.Note) {
      providerMessage = data.Information ?? data.Note ?? providerMessage
    }

    quotes.push(...chunkQuotes)
  }

  if (!quotes.length) {
    throw new Error(providerMessage || "Alpha bulk quote endpoint returned no quotes")
  }

  return quotes
}

async function fetchAlphaQuote(symbol: string, apiKey: string): Promise<MarketQuote> {
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(
    symbol,
  )}&apikey=${encodeURIComponent(apiKey)}`
  const data = await fetchJson<AlphaQuoteResponse>(url)
  const quote = data["Global Quote"]
  const price = Number(quote?.["05. price"])
  const previousClose = Number(quote?.["08. previous close"])

  if (!Number.isFinite(price) || !Number.isFinite(previousClose)) {
    throw new Error("Alpha Vantage response did not include a usable price")
  }

  const change = Number(quote?.["09. change"]) || price - previousClose

  return {
    symbol: (quote?.["01. symbol"] ?? symbol).toUpperCase(),
    price,
    previousClose,
    change,
    changePercent: Number.parseFloat(quote?.["10. change percent"] ?? "") || (change / previousClose) * 100,
    updatedAt: new Date().toISOString(),
  }
}

export async function getPriceHistoryPayload(symbol: string): Promise<PriceHistoryPayload> {
  const normalizedSymbol = symbol.trim().toUpperCase()
  const alphaKey = process.env.ALPHA_VANTAGE_API_KEY
  const updatedAt = new Date().toISOString()

  if (!alphaKey) {
    return {
      symbol: normalizedSymbol,
      points: [],
      provider: "Alpha Vantage",
      message: "Add ALPHA_VANTAGE_API_KEY to load historical price movement.",
      updatedAt,
    }
  }

  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(
      normalizedSymbol,
    )}&outputsize=compact&apikey=${encodeURIComponent(alphaKey)}`
    const data = await fetchJson<AlphaDailyResponse>(url)
    const series = data["Time Series (Daily)"]

    if (!series) {
      throw new Error(data.Information ?? data.Note ?? data["Error Message"] ?? "Alpha Vantage returned no history")
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

    if (!points.length) {
      throw new Error("Alpha Vantage returned no usable history")
    }

    return {
      symbol: normalizedSymbol,
      points,
      provider: "Alpha Vantage",
      message: `${points.length} daily price records loaded.`,
      updatedAt,
    }
  } catch (error) {
    const alphaMessage =
      error instanceof Error ? sanitizeProviderMessage(error.message) : "Alpha Vantage did not return historical price data."

    try {
      const points = await fetchYahooHistory(normalizedSymbol)

      return {
        symbol: normalizedSymbol,
        points,
        provider: "Yahoo Finance unofficial",
        message: `${points.length} daily price records loaded. Alpha Vantage history was unavailable: ${alphaMessage}`,
        updatedAt,
      }
    } catch (historyFallbackError) {
      return {
        symbol: normalizedSymbol,
        points: [],
        provider: "Alpha Vantage / Yahoo Finance",
        message: `Historical price data is unavailable right now. ${alphaMessage} ${
          historyFallbackError instanceof Error ? sanitizeProviderMessage(historyFallbackError.message) : ""
        }`.trim(),
        updatedAt,
      }
    }
  }
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

async function fetchAlphaOptions(symbol: string, apiKey: string): Promise<OptionContract[]> {
  const url = `https://www.alphavantage.co/query?function=HISTORICAL_OPTIONS&symbol=${encodeURIComponent(
    symbol,
  )}&apikey=${encodeURIComponent(apiKey)}`
  const data = await fetchJson<AlphaOptionsResponse>(url)

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

export async function getMarketPayload(symbols: string[], optionSymbol?: string): Promise<MarketPayload> {
  const normalizedSymbols = symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)
  const selectedOptionSymbol = (optionSymbol ?? normalizedSymbols[0] ?? "AAPL").toUpperCase()
  const factSetCredentials = getFactSetCredentials()
  const alphaKey = process.env.ALPHA_VANTAGE_API_KEY
  const updatedAt = new Date().toISOString()
  let factSetError = ""
  let alphaError = ""

  if (factSetCredentials) {
    try {
      const quoteResults = await fetchFactSetQuotes(normalizedSymbols, factSetCredentials)

      return {
        quotes: quoteResults,
        options: [],
        provider: "FactSet Real-Time Quotes",
        isLive: true,
        message: `${quoteResults.length} latest FactSet prices loaded. Options still require an options-enabled provider integration.`,
        updatedAt,
      }
    } catch (error) {
      factSetError =
        error instanceof Error ? `FactSet was unavailable: ${sanitizeProviderMessage(error.message)}` : "FactSet was unavailable."
    }
  }

  if (alphaKey) {
    try {
      const quoteResults = await (normalizedSymbols.length > 5 ? fetchAlphaBulkQuotes(normalizedSymbols, alphaKey) : Promise.reject()).catch(async () => {
        const settled = await Promise.allSettled(
          normalizedSymbols.slice(0, 25).map((symbol) => fetchAlphaQuote(symbol, alphaKey)),
        )
        return settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
      })
      const options = await fetchAlphaOptions(selectedOptionSymbol, alphaKey).catch(() => [])

      if (!quoteResults.length) {
        throw new Error("Alpha Vantage returned no usable quotes")
      }

      return {
        quotes: quoteResults,
        options,
        provider: "Alpha Vantage",
        isLive: true,
        message: options.length
          ? "Live quotes loaded. Options availability depends on your Alpha Vantage plan."
          : `Live quotes loaded for ${quoteResults.length} symbols. Add Alpha Vantage options access for chains.`,
        updatedAt,
      }
    } catch {
      alphaError = "Alpha Vantage did not return usable bulk quote data for this request."
    }
  }

  try {
    const quoteResults = await fetchStooqQuotes(normalizedSymbols)

    return {
      quotes: quoteResults,
      options: [],
      provider: "Stooq delayed market data",
      isLive: true,
      message: `${quoteResults.length} latest available stock prices loaded. ${factSetError} ${alphaError} Options still require an options-enabled provider plan.`.trim(),
      updatedAt,
    }
  } catch {
    if (alphaKey) {
      return {
        quotes: [],
        options: [],
        provider: "Alpha Vantage / Stooq",
        isLive: false,
        message:
          `No full-universe quote provider returned usable data. ${factSetError} Alpha bulk likely needs a paid plan, and the delayed quote fallback did not respond.`.trim(),
        updatedAt,
      }
    }
  }

  try {
    const quoteResults = await Promise.all(normalizedSymbols.map(fetchYahooQuote))
    const options = await fetchYahooOptions(selectedOptionSymbol).catch(() => [])

    return {
      quotes: quoteResults,
      options,
      provider: "Yahoo Finance unofficial",
      isLive: true,
      message: options.length
        ? "Live/delayed quotes and options loaded from an unofficial no-key endpoint."
        : "Live/delayed quotes loaded; options endpoint was unavailable.",
      updatedAt,
    }
  } catch {
    const fallbackHoldings = normalizedSymbols
      .map((symbol) => holdings.find((holding) => holding.id === symbol))
      .filter((holding): holding is Holding => Boolean(holding))

    return {
      quotes: fallbackHoldings.map(fallbackQuote),
      options: [],
      provider: "Sample fallback",
      isLive: false,
      message:
        "No live no-key provider responded. Add FACTSET_USERNAME and FACTSET_API_KEY for FactSet quotes, or ALPHA_VANTAGE_API_KEY for Alpha Vantage quotes/options.",
      updatedAt,
    }
  }
}

type CompanyTickerRecord = {
  cik_str: number
  ticker: string
  title: string
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
            frame?: string
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
            fy?: number
            fp?: string
            form?: string
            filed?: string
            end?: string
            frame?: string
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
    .sort((first, second) => {
      const firstDate = `${first.end ?? ""}-${first.filed ?? ""}`
      const secondDate = `${second.end ?? ""}-${second.filed ?? ""}`
      return secondDate.localeCompare(firstDate)
    })[0]
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

export async function getFilingsPayload(symbol: string): Promise<FilingsPayload> {
  const normalizedSymbol = symbol.toUpperCase()
  const updatedAt = new Date().toISOString()

  try {
    const tickerData = await fetchJson<Record<string, CompanyTickerRecord>>("https://www.sec.gov/files/company_tickers.json", {
      headers: secHeaders,
    })
    const company = Object.values(tickerData).find((record) => {
      const ticker = record.ticker.toUpperCase()
      return ticker === normalizedSymbol || ticker.replace(".", "-") === normalizedSymbol || ticker.replace("-", ".") === normalizedSymbol
    })

    if (!company) {
      throw new Error(`No CIK found for ${normalizedSymbol}`)
    }

    const cik = String(company.cik_str).padStart(10, "0")
    const [submissions, companyFacts] = await Promise.all([
      fetchJson<CompanySubmissions>(`https://data.sec.gov/submissions/CIK${cik}.json`, {
        headers: secHeaders,
      }),
      fetchJson<CompanyFacts>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
        headers: secHeaders,
      }).catch(() => null),
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

        return {
          accessionNumber,
          form,
          filedAt: recent?.filingDate?.[index] ?? "",
          reportDate: recent?.reportDate?.[index],
          description: recent?.primaryDocDescription?.[index] || `${form} filing`,
          url: `https://www.sec.gov/Archives/edgar/data/${company.cik_str}/${accessionNoDashes}/${primaryDocument}`,
        }
      })
      .filter((filing): filing is Filing => Boolean(filing))
      .slice(0, 6)

    return {
      symbol: normalizedSymbol,
      cik,
      companyName: submissions.name || company.title,
      filings,
      statements: companyFacts
        ? {
            source: "SEC CompanyFacts",
            statements: buildFinancialStatements(companyFacts),
          }
        : undefined,
      provider: "SEC EDGAR",
      message: "Official SEC EDGAR submissions and XBRL financial statements loaded.",
      updatedAt,
    }
  } catch {
    return {
      symbol: normalizedSymbol,
      filings: [],
      provider: "Fallback",
      message: "SEC EDGAR did not respond. Try again shortly or set a descriptive SEC_USER_AGENT.",
      updatedAt,
    }
  }
}
