"use client"

import { useEffect, useMemo, useState } from "react"
import { Activity, Search } from "lucide-react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { formatCurrency, formatPercent } from "@/lib/portfolio-data"
import { loadPriceHistory } from "@/lib/static-market-data"
import type { PriceHistoryPayload, PriceHistoryRange, Security } from "@/lib/market-types"

type PerformanceChartProps = {
  securities: Security[]
  symbol: string
  onSymbolChange: (symbol: string) => void
}

const rangeOptions: Array<{ id: PriceHistoryRange; label: string }> = [
  { id: "ytd", label: "YTD" },
  { id: "1w", label: "1W" },
  { id: "1m", label: "1M" },
  { id: "1y", label: "1Y" },
  { id: "5y", label: "5Y" },
  { id: "10y", label: "10Y" },
  { id: "all", label: "ALL" },
]

function formatAxisDate(value: number, range: PriceHistoryRange) {
  const date = new Date(value)

  if (range === "1w") {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
    }).format(date)
  }

  if (range === "1m" || range === "ytd") {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(date)
  }

  if (range === "1y") {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
    }).format(date)
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
  }).format(date)
}

export function PerformanceChart({ securities, symbol, onSymbolChange }: PerformanceChartProps) {
  const [history, setHistory] = useState<PriceHistoryPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [range, setRange] = useState<PriceHistoryRange>("ytd")
  const selectedSecurity = securities.find((security) => security.symbol === symbol)

  useEffect(() => {
    let isMounted = true

    async function loadHistory() {
      setIsLoading(true)

      try {
        const payload = await loadPriceHistory(symbol, range)

        if (isMounted) {
          setHistory(payload)
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadHistory()

    return () => {
      isMounted = false
    }
  }, [range, symbol])

  const points = history?.points ?? []
  const chartPoints = points.map((point) => ({
    ...point,
    timestamp: new Date(point.date).getTime(),
  }))
  const prices = points.map((point) => point.close)
  const latest = points.at(-1)
  const first = points[0]
  const movement = latest && first ? latest.close - first.close : 0
  const movementPercent = first?.close ? (movement / first.close) * 100 : 0
  const low = prices.length ? Math.min(...prices) : 0
  const high = prices.length ? Math.max(...prices) : 1
  const padding = Math.max((high - low) * 0.2, high * 0.03)
  const sourceText = history?.message ?? "Loading price history."
  const selectOptions = useMemo(() => securities.slice(0, 503), [securities])
  const rangeLabel = rangeOptions.find((option) => option.id === range)?.label ?? "YTD"

  return (
    <section className="rounded-2xl bg-[#0D0D0D] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[#919191]">
            <Activity className="h-5 w-5" />
            <span className="text-sm">Price movement</span>
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <h2 className="text-2xl font-semibold text-white">{symbol}</h2>
            <span className="text-sm text-[#919191]">{selectedSecurity?.name ?? "Selected security"}</span>
            {latest ? <span className="text-xl font-medium text-white">{formatCurrency(latest.close)}</span> : null}
            {latest && first ? (
              <span className={movement >= 0 ? "text-sm text-[#86efac]" : "text-sm text-[#F87171]"}>
                {movement >= 0 ? "+" : ""}
                {formatCurrency(movement)} {formatPercent(movementPercent)}
              </span>
            ) : null}
            <span className="text-xs uppercase tracking-[0.16em] text-[#6f8098]">{rangeLabel}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          <div className="flex flex-wrap gap-2">
            {rangeOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setRange(option.id)}
                className={`h-9 rounded-lg px-3 text-xs font-medium tracking-[0.12em] transition-colors ${
                  range === option.id ? "bg-[#1f3552] text-white" : "bg-[#171717] text-[#8da0ba] hover:bg-[#1a2230] hover:text-white"
                }`}
                aria-pressed={range === option.id}
              >
                {option.label}
              </button>
            ))}
          </div>

          <label className="flex h-10 min-w-[260px] items-center gap-2 rounded-lg bg-[#171717] px-3 text-sm text-[#919191]">
            <Search className="h-4 w-4" />
            <select
              value={symbol}
              onChange={(event) => onSymbolChange(event.target.value)}
              className="w-full bg-transparent text-white outline-none"
              aria-label="Change chart ticker"
            >
              {selectOptions.map((security) => (
                <option key={security.symbol} value={security.symbol} className="bg-[#111] text-white">
                  {security.symbol} · {security.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-sm text-[#919191]">
        <span>{history?.provider ?? "yfinance / Yahoo Finance"}</span>
        <span>{isLoading ? "Loading..." : sourceText}</span>
      </div>

      <div className="mt-5 h-[320px] w-full">
        {points.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartPoints}>
              <defs>
                <linearGradient id="priceMovement" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#86efac" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#86efac" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F1F1F" vertical={false} />
              <XAxis
                type="number"
                dataKey="timestamp"
                domain={["dataMin", "dataMax"]}
                scale="time"
                minTickGap={28}
                tick={{ fill: "#777", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => formatAxisDate(Number(value), range)}
              />
              <YAxis
                domain={[Math.max(0, low - padding), high + padding]}
                tick={{ fill: "#777", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
                scale="linear"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload?.length) {
                    const point = payload[0].payload

                    return (
                      <div className="rounded-lg border border-[#333] bg-[#1A1A1A] p-3 shadow-xl">
                        <p className="font-medium text-white">{formatCurrency(Number(payload[0].value))}</p>
                        <p className="text-xs text-[#919191]">
                          {new Intl.DateTimeFormat("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          }).format(new Date(point.date))}{" "}
                          · Vol {point.volume?.toLocaleString() ?? "--"}
                        </p>
                      </div>
                    )
                  }

                  return null
                }}
              />
              <Area
                type="monotone"
                dataKey="close"
                stroke="#86efac"
                strokeWidth={2}
                fill="url(#priceMovement)"
                activeDot={{ r: 4, fill: "#86efac" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-[#1F1F1F] text-sm text-[#919191]">
            {isLoading ? "Loading price movement..." : sourceText}
          </div>
        )}
      </div>
    </section>
  )
}
