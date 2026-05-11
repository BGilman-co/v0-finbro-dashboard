import type { Holding, PricePoint } from "@/lib/portfolio-data"

export type Security = {
  symbol: string
  name: string
  sector: string
  industry?: string
  exchange?: string
  cik?: string
}

export type UniversePayload = {
  securities: Security[]
  count: number
  provider: string
  updatedAt: string
}

export type MarketQuote = {
  symbol: string
  price: number
  previousClose: number
  change: number
  changePercent: number
  dayHigh?: number
  dayLow?: number
  volume?: number
  updatedAt: string
}

export type OptionContract = {
  contract: string
  type: "call" | "put"
  strike: number
  expiration?: string
  lastPrice?: number
  bid?: number
  ask?: number
  volume?: number
  openInterest?: number
  impliedVolatility?: number
}

export type MarketPayload = {
  quotes: MarketQuote[]
  options: OptionContract[]
  provider: string
  isLive: boolean
  message: string
  updatedAt: string
}

export type Filing = {
  accessionNumber: string
  form: string
  filedAt: string
  reportDate?: string
  description: string
  url: string
}

export type FilingsPayload = {
  symbol: string
  cik?: string
  companyName?: string
  filings: Filing[]
  statements?: FinancialStatementsPayload
  provider: "SEC EDGAR" | "Fallback"
  message: string
  updatedAt: string
}

export type FinancialStatementLine = {
  label: string
  tag: string
  unit: string
  annual?: number
  annualPeriod?: string
  annualFiled?: string
  quarterly?: number
  quarterlyPeriod?: string
  quarterlyFiled?: string
}

export type FinancialStatement = {
  title: string
  rows: FinancialStatementLine[]
}

export type FinancialStatementsPayload = {
  source: "SEC CompanyFacts"
  statements: FinancialStatement[]
}

export type PriceHistoryPoint = {
  date: string
  label: string
  open?: number
  high?: number
  low?: number
  close: number
  volume?: number
}

export type PriceHistoryRange = "1w" | "1m" | "ytd" | "1y" | "5y" | "10y" | "all"

export type PriceHistoryPayload = {
  symbol: string
  range: PriceHistoryRange
  points: PriceHistoryPoint[]
  provider: string
  message: string
  updatedAt: string
}

export function mergeQuotesIntoHoldings(sourceHoldings: Holding[], quotes: MarketQuote[]): Holding[] {
  const quoteMap = new Map(quotes.map((quote) => [quote.symbol.toUpperCase(), quote]))

  return sourceHoldings.map((holding) => {
    const quote = quoteMap.get(holding.id)

    if (!quote) {
      return holding
    }

    const history = [...holding.history]
    const latest = history.at(-1)
    const nextPoint: PricePoint = {
      date: quote.updatedAt,
      label: new Date(quote.updatedAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }),
      price: quote.price,
    }

    if (latest) {
      history[history.length - 1] = nextPoint
    } else {
      history.push(nextPoint)
    }

    return { ...holding, history }
  })
}
