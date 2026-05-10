"use client"

import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react"
import { formatCurrency, formatPercent } from "@/lib/portfolio-data"
import type { MarketQuote, Security } from "@/lib/market-types"

export type SortKey = "symbol" | "company" | "sector" | "price" | "change" | "volume"

type TickerListProps = {
  securities: Security[]
  quotes: MarketQuote[]
  selectedSymbol: string
  search: string
  sortKey: SortKey
  sortDirection: "asc" | "desc"
  onSearchChange: (value: string) => void
  onSelect: (symbol: string) => void
  onSort: (key: SortKey) => void
}

function emptyDash(value: string | number | undefined) {
  return value === undefined || value === "" ? "--" : value
}

export function TickerList({
  securities,
  quotes,
  selectedSymbol,
  search,
  sortKey,
  sortDirection,
  onSearchChange,
  onSelect,
  onSort,
}: TickerListProps) {
  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]))
  const normalizedSearch = search.trim().toLowerCase()
  const filteredSecurities = securities.filter((security) => {
    if (!normalizedSearch) {
      return true
    }

    return [security.symbol, security.name, security.sector, security.industry]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(normalizedSearch))
  })
  const sortedSecurities = [...filteredSecurities].sort((first, second) => {
    const firstQuote = quoteMap.get(first.symbol)
    const secondQuote = quoteMap.get(second.symbol)
    const values: Record<SortKey, [string | number, string | number]> = {
      symbol: [first.symbol, second.symbol],
      company: [first.name, second.name],
      sector: [first.sector, second.sector],
      price: [firstQuote?.price ?? -1, secondQuote?.price ?? -1],
      change: [firstQuote?.changePercent ?? -999, secondQuote?.changePercent ?? -999],
      volume: [firstQuote?.volume ?? -1, secondQuote?.volume ?? -1],
    }
    const [firstValue, secondValue] = values[sortKey]
    const result =
      typeof firstValue === "string" && typeof secondValue === "string"
        ? firstValue.localeCompare(secondValue)
        : Number(firstValue) - Number(secondValue)

    return sortDirection === "asc" ? result : result * -1
  })
  const visibleSecurities = sortedSecurities
  const sortLabel = sortDirection === "asc" ? "ascending" : "descending"

  return (
    <div className="rounded-2xl bg-[#0D0D0D] p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">S&P 500 securities</h2>
          <p className="mt-1 text-sm text-[#919191]">
            Showing all {visibleSecurities.length.toLocaleString()} matches. Alpha bulk quotes load for every listed row when the key has bulk-market access.
          </p>
        </div>
        <label className="flex h-10 min-w-[260px] items-center gap-2 rounded-lg bg-[#171717] px-3 text-sm text-[#919191]">
          <Search className="h-4 w-4" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search symbol, company, sector"
            className="w-full bg-transparent text-white outline-none placeholder:text-[#666]"
          />
        </label>
      </div>

      <div className="max-h-[560px] overflow-auto lg:hidden">
        <div className="flex flex-col gap-2">
          {visibleSecurities.map((security) => {
            const quote = quoteMap.get(security.symbol)
            const trend = (quote?.change ?? 0) >= 0 ? "up" : "down"
            const selected = security.symbol === selectedSymbol

            return (
              <button
                key={security.symbol}
                onClick={() => onSelect(security.symbol)}
                className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                  selected ? "border-[#2E8CFF] bg-[#172435]" : "border-[#1F1F1F] bg-[#111] hover:bg-[#171717]"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{security.symbol}</span>
                      <span className="text-xs text-[#777]">{emptyDash(security.exchange)}</span>
                    </div>
                    <div className="mt-1 truncate text-sm font-medium text-white">{security.name}</div>
                    <div className="mt-1 truncate text-xs text-[#919191]">{security.sector}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-semibold text-white">{quote ? formatCurrency(quote.price) : "--"}</div>
                    <div className={quote ? (trend === "up" ? "text-sm text-[#4ADE80]" : "text-sm text-[#F87171]") : "text-sm text-[#777]"}>
                      {quote ? formatPercent(quote.changePercent) : "--"}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="hidden max-h-[560px] overflow-auto lg:block">
        <table className="w-full min-w-[1040px] table-fixed">
          <thead className="sticky top-0 z-10 bg-[#0D0D0D]">
            <tr className="text-sm text-[#919191]">
              {[
                ["symbol", "Symbol", "w-[120px] text-left"],
                ["company", "Company", "w-[280px] text-left"],
                ["sector", "Sector", "w-[220px] text-left"],
                ["price", "Mkt. Price", "w-[140px] text-right"],
                ["change", "1D Change", "w-[140px] text-right"],
                ["volume", "Volume", "w-[140px] text-right"],
              ].map(([key, label, width]) => (
                <th key={key} className={`border-b border-[#1F1F1F] px-3 py-3 font-medium ${width}`}>
                  <button
                    className={`inline-flex items-center gap-1 hover:text-white ${String(width).includes("right") ? "justify-end" : ""}`}
                    onClick={() => onSort(key as SortKey)}
                    aria-label={`Sort by ${label} ${sortLabel}`}
                  >
                    {label}
                    <ChevronsUpDown className="h-4 w-4" />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleSecurities.map((security) => {
              const quote = quoteMap.get(security.symbol)
              const trend = (quote?.change ?? 0) >= 0 ? "up" : "down"
              const selected = security.symbol === selectedSymbol

              return (
                <tr
                  key={security.symbol}
                  onClick={() => onSelect(security.symbol)}
                  className={`cursor-pointer border-b border-[#151515] transition-colors last:border-0 ${
                    selected ? "bg-[#1A1A1A]" : "hover:bg-[#151515]"
                  }`}
                >
                  <td className="px-3 py-3 align-middle">
                    <div className="font-semibold text-white">{security.symbol}</div>
                    <div className="text-xs text-[#777]">{emptyDash(security.exchange)}</div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="truncate font-medium text-white">{security.name}</div>
                    <div className="truncate text-xs text-[#777]">{emptyDash(security.industry)}</div>
                  </td>
                  <td className="px-3 py-3 align-middle text-sm text-[#D8E5F7]">{security.sector}</td>
                  <td className="px-3 py-3 text-right align-middle font-medium text-white">
                    {quote ? formatCurrency(quote.price) : "--"}
                  </td>
                  <td
                    className={`px-3 py-3 text-right align-middle font-medium ${
                      quote ? (trend === "up" ? "text-[#4ADE80]" : "text-[#F87171]") : "text-[#777]"
                    }`}
                  >
                    {quote ? (
                      <span className="inline-flex items-center justify-end gap-1">
                        {trend === "up" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                        {formatPercent(quote.changePercent)}
                      </span>
                    ) : (
                      "--"
                    )}
                  </td>
                  <td className="px-3 py-3 text-right align-middle font-medium text-white">
                    {quote?.volume ? quote.volume.toLocaleString() : "--"}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
