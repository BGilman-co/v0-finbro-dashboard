"use client"

import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer } from "recharts"
import {
  type Holding,
  formatCompactCurrency,
  formatCurrency,
  formatPercent,
  getHoldingStats,
  getSeries,
} from "@/lib/portfolio-data"

export type SortKey = "symbol" | "company" | "sector" | "marketCap" | "price" | "change" | "records"

type TickerListProps = {
  holdings: Holding[]
  selectedSymbol: string
  sortKey: SortKey
  sortDirection: "asc" | "desc"
  onSelect: (symbol: string) => void
  onSort: (key: SortKey) => void
}

export function TickerList({
  holdings,
  selectedSymbol,
  sortKey,
  sortDirection,
  onSelect,
  onSort,
}: TickerListProps) {
  const sortedHoldings = [...holdings].sort((first, second) => {
    const firstStats = getHoldingStats(first)
    const secondStats = getHoldingStats(second)
    const values: Record<SortKey, [string | number, string | number]> = {
      symbol: [first.id, second.id],
      company: [first.name, second.name],
      sector: [first.sector, second.sector],
      marketCap: [first.marketCap, second.marketCap],
      price: [firstStats.latest, secondStats.latest],
      change: [firstStats.oneDayPercent, secondStats.oneDayPercent],
      records: [firstStats.recordCount, secondStats.recordCount],
    }
    const [firstValue, secondValue] = values[sortKey]
    const result =
      typeof firstValue === "string" && typeof secondValue === "string"
        ? firstValue.localeCompare(secondValue)
        : Number(firstValue) - Number(secondValue)

    return sortDirection === "asc" ? result : result * -1
  })

  const sortLabel = sortDirection === "asc" ? "ascending" : "descending"

  return (
    <div className="overflow-x-auto rounded-2xl bg-[#0D0D0D] p-6">
      <table className="w-full">
        <thead>
          <tr className="text-[#919191] text-sm border-b border-transparent">
            <th className="pb-4 text-left font-medium pl-2">
              <button
                className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                onClick={() => onSort("symbol")}
                aria-label={`Sort by symbol ${sortLabel}`}
              >
                Symbol
                <ChevronsUpDown className="h-4 w-4" />
              </button>
            </th>
            <th className="pb-4 text-left font-medium w-[120px]"></th>
            {[
              ["company", "Company"],
              ["sector", "Sector"],
              ["marketCap", "Market Cap"],
              ["price", "Mkt. Price"],
              ["change", "1D Change"],
              ["records", "Records"],
            ].map(([key, label]) => (
              <th key={key} className="pb-4 text-right font-medium">
                <button className="inline-flex items-center justify-end gap-1 hover:text-white transition-colors" onClick={() => onSort(key as SortKey)}>
                  {label}
                  <ChevronsUpDown className="h-4 w-4" />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedHoldings.map((item) => {
            const stats = getHoldingStats(item)
            const trend = stats.oneDayChange >= 0 ? "up" : "down"
            const chartData = getSeries(item, "1M").map((point) => ({ value: point.price }))

            return (
            <tr
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`group transition-colors border-b border-transparent last:border-0 ${
                item.id === selectedSymbol ? 'bg-[#1A1A1A]' : 'hover:bg-[#1A1A1A]'
              }`}
            >
              <td className="py-4 pl-2 rounded-l-xl">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-white">{item.id}</span>
                  <span className="text-xs text-[#919191]">{item.exchange}</span>
                </div>
              </td>
              <td className="py-4">
                <div className="h-10 w-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id={`gradient-${item.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={trend === 'up' ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={trend === 'up' ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke={trend === 'up' ? '#22c55e' : '#ef4444'}
                        strokeWidth={2}
                        fill={`url(#gradient-${item.id})`}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </td>
              <td className="py-4 text-right text-white font-medium">{item.name}</td>
              <td className="py-4 text-right text-white font-medium">{item.sector}</td>
              <td className="py-4 text-right text-white font-medium">{formatCompactCurrency(item.marketCap)}</td>
              <td className="py-4 text-right text-white font-medium">{formatCurrency(stats.latest)}</td>
              <td className={`py-4 text-right font-medium ${trend === 'up' ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                <div className="flex items-center justify-end gap-1">
                  {trend === 'up' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                  {formatPercent(stats.oneDayPercent)}
                </div>
              </td>
              <td className="py-4 text-right text-white font-medium pr-2 rounded-r-xl">{stats.recordCount.toLocaleString()}</td>
            </tr>
          )})}
        </tbody>
      </table>
    </div>
  )
}
