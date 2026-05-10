"use client"

import { ExternalLink, FileText, RadioTower, RefreshCw } from "lucide-react"
import { formatCurrency, formatPercent } from "@/lib/portfolio-data"
import type { Filing, FinancialStatementLine, FilingsPayload, MarketPayload } from "@/lib/market-types"

type MarketIntelligenceProps = {
  symbol: string
  market: MarketPayload | null
  filings: FilingsPayload | null
  isLoading: boolean
  onRefresh: () => void
}

function formatDate(value?: string) {
  if (!value) {
    return "Pending"
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`))
}

function FilingRow({ filing }: { filing: Filing }) {
  return (
    <a
      href={filing.url}
      target="_blank"
      rel="noreferrer"
      className="grid grid-cols-[58px_1fr_auto] items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-[#171717]"
    >
      <span className="rounded-md border border-[#2A2A2A] px-2 py-1 text-center text-xs font-medium text-white">
        {filing.form}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm text-white">{filing.description}</span>
        <span className="block text-xs text-[#919191]">
          Filed {formatDate(filing.filedAt)}
          {filing.reportDate ? ` · Period ${formatDate(filing.reportDate)}` : ""}
        </span>
      </span>
      <ExternalLink className="h-4 w-4 text-[#666]" />
    </a>
  )
}

function formatStatementValue(row: FinancialStatementLine, value?: number) {
  if (value === undefined) {
    return "--"
  }

  if (row.unit === "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(value)
  }

  return new Intl.NumberFormat("en-US", {
    notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: 2,
  }).format(value)
}

export function MarketIntelligence({
  symbol,
  market,
  filings,
  isLoading,
  onRefresh,
}: MarketIntelligenceProps) {
  const selectedQuote = market?.quotes.find((quote) => quote.symbol === symbol)
  const liveColor = market?.isLive ? "bg-[#86efac]" : "bg-[#f59e0b]"
  const updatedAt = market?.updatedAt
    ? new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(market.updatedAt))
    : "Not loaded"

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.75fr)]">
      <div className="rounded-2xl bg-[#0D0D0D] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[#919191]">
              <RadioTower className="h-5 w-5" />
              <span className="text-sm">Market data</span>
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <h2 className="text-2xl font-semibold text-white">{symbol}</h2>
              {selectedQuote ? (
                <>
                  <span className="text-xl font-medium text-white">{formatCurrency(selectedQuote.price)}</span>
                  <span className={selectedQuote.change >= 0 ? "text-sm text-[#86efac]" : "text-sm text-[#F87171]"}>
                    {selectedQuote.change >= 0 ? "+" : ""}
                    {formatCurrency(selectedQuote.change)} {formatPercent(selectedQuote.changePercent)}
                  </span>
                </>
              ) : null}
            </div>
          </div>

          <button
            onClick={onRefresh}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1A1A1A] px-3 text-sm text-white transition-colors hover:bg-[#252525]"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[#1F1F1F] pt-4 text-sm text-[#919191]">
          <span className={`h-2.5 w-2.5 rounded-full ${liveColor}`} />
          <span>{market?.provider ?? "Connecting"}</span>
          <span>Updated {updatedAt}</span>
          <span className="max-w-2xl">{market?.message ?? "Loading market source status."}</span>
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-[#1F1F1F]">
          <div className="grid grid-cols-[1fr_72px_72px_72px_88px] gap-3 bg-[#151515] px-4 py-3 text-xs text-[#919191]">
            <span>Options</span>
            <span className="text-right">Strike</span>
            <span className="text-right">Last</span>
            <span className="text-right">Volume</span>
            <span className="text-right">OI</span>
          </div>
          <div className="divide-y divide-[#1F1F1F]">
            {market?.options.length ? (
              market.options.map((option) => (
                <div
                  key={option.contract}
                  className="grid grid-cols-[1fr_72px_72px_72px_88px] gap-3 px-4 py-3 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-white">{option.contract}</span>
                    <span className="text-xs uppercase text-[#919191]">
                      {option.type} {option.expiration ?? ""}
                    </span>
                  </span>
                  <span className="text-right text-white">{formatCurrency(option.strike)}</span>
                  <span className="text-right text-white">
                    {option.lastPrice ? formatCurrency(option.lastPrice) : "--"}
                  </span>
                  <span className="text-right text-white">{option.volume?.toLocaleString() ?? "--"}</span>
                  <span className="text-right text-white">{option.openInterest?.toLocaleString() ?? "--"}</span>
                </div>
              ))
            ) : (
              <div className="px-4 py-5 text-sm text-[#919191]">
                Options are ready to display when a provider responds or an options-enabled key is configured.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-[#0D0D0D] p-6">
        <div className="flex items-center gap-2 text-[#919191]">
          <FileText className="h-5 w-5" />
          <span className="text-sm">SEC EDGAR</span>
        </div>
        <h2 className="mt-2 text-xl font-semibold text-white">{filings?.companyName ?? `${symbol} filings`}</h2>
        <p className="mt-1 text-sm text-[#919191]">{filings?.message ?? "Loading official 10-K and 10-Q filings."}</p>

        <div className="mt-5 flex flex-col gap-1">
          {filings?.filings.length ? (
            filings.filings.map((filing) => <FilingRow key={filing.accessionNumber} filing={filing} />)
          ) : (
            <div className="rounded-lg border border-[#1F1F1F] px-4 py-5 text-sm text-[#919191]">
              No recent 10-K or 10-Q filings loaded yet.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-[#0D0D0D] p-6 xl:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-[#919191]">Financial statements</p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              {filings?.companyName ?? symbol} SEC XBRL tables
            </h2>
          </div>
          <span className="rounded-lg bg-[#1A1A1A] px-3 py-2 text-sm text-[#86efac]">
            {filings?.statements?.source ?? "SEC CompanyFacts"}
          </span>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          {filings?.statements?.statements.length ? (
            filings.statements.statements.map((statement) => (
              <div key={statement.title} className="overflow-hidden rounded-xl border border-[#1F1F1F]">
                <div className="bg-[#151515] px-4 py-3 text-sm font-medium text-white">{statement.title}</div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] table-fixed text-sm">
                    <thead className="text-[#919191]">
                      <tr>
                        <th className="w-[220px] px-4 py-3 text-left font-medium">Line item</th>
                        <th className="w-[150px] px-4 py-3 text-right font-medium">Latest 10-K</th>
                        <th className="w-[150px] px-4 py-3 text-right font-medium">Latest 10-Q</th>
                        <th className="w-[100px] px-4 py-3 text-left font-medium">Tag</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1F1F1F]">
                      {statement.rows.map((row) => (
                        <tr key={`${statement.title}-${row.tag}`}>
                          <td className="px-4 py-3 text-white">
                            <div>{row.label}</div>
                            <div className="text-xs text-[#777]">{row.unit}</div>
                          </td>
                          <td className="px-4 py-3 text-right text-white">
                            <div>{formatStatementValue(row, row.annual)}</div>
                            <div className="text-xs text-[#777]">{row.annualPeriod ?? "--"}</div>
                          </td>
                          <td className="px-4 py-3 text-right text-white">
                            <div>{formatStatementValue(row, row.quarterly)}</div>
                            <div className="text-xs text-[#777]">{row.quarterlyPeriod ?? "--"}</div>
                          </td>
                          <td className="truncate px-4 py-3 text-xs text-[#919191]" title={row.tag}>
                            {row.tag}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-[#1F1F1F] px-4 py-6 text-sm text-[#919191]">
              Select an S&P 500 company to load statement tables from SEC EDGAR CompanyFacts.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
