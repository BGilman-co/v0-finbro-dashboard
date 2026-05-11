"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, BarChart3, Database, FileSpreadsheet, RefreshCw } from "lucide-react"

import {
  loadWrdsFactsetEndpoints,
  loadWrdsFactsetRows,
  type WrdsFactsetEndpointsPayload,
  type WrdsFactsetPayload,
} from "@/lib/static-market-data"

type WrdsDataPanelProps = {
  symbol: string
  companyName?: string
}

type WrdsLoadState = {
  prices: WrdsFactsetPayload | null
  fundamentals: WrdsFactsetPayload | null
  endpoints: WrdsFactsetEndpointsPayload | null
  securityId: string | null
  message: string | null
}

const emptyState: WrdsLoadState = {
  prices: null,
  fundamentals: null,
  endpoints: null,
  securityId: null,
  message: null,
}

function textValue(row: Record<string, unknown>, key: string) {
  const value = row[key]
  return typeof value === "string" && value.trim() ? value : "--"
}

function numericValue(row: Record<string, unknown>, key: string) {
  const value = row[key]

  if (typeof value === "number") {
    return value
  }

  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function formatNumber(value: number | null, options?: Intl.NumberFormatOptions) {
  if (value === null) {
    return "--"
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    ...options,
  }).format(value)
}

function formatCurrency(value: number | null, currency = "USD") {
  if (value === null) {
    return "--"
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: 2,
  }).format(value)
}

function latestRows(payload: WrdsFactsetPayload | null, dateKey: string) {
  return [...(payload?.results ?? [])].sort((first, second) =>
    textValue(second, dateKey).localeCompare(textValue(first, dateKey)),
  )
}

function pickPrimarySecurity(rows: Array<Record<string, unknown>>) {
  const usPrimary = rows.find(
    (row) => textValue(row, "region") === "US" && textValue(row, "primary_security") !== "--",
  )
  const anyPrimary = rows.find((row) => textValue(row, "primary_security") !== "--")
  const anyFsym = rows.find((row) => textValue(row, "fsym_id") !== "--")

  return textValue(usPrimary ?? anyPrimary ?? anyFsym ?? {}, "primary_security").replace("--", "") || null
}

async function loadLatestTickerPrices(symbol: string) {
  return loadWrdsFactsetRows({
    table: "factset.monthly_prices_final_usc_v3",
    limit: 1,
    filters: { tic: symbol },
  })
}

async function loadLatestSecurityPrices(securityId: string) {
  const initial = await loadWrdsFactsetRows({
    table: "factset.monthly_prices_final_usc_v3",
    limit: 1,
    filters: { fsym_id: securityId },
  })

  if (!initial.ok || initial.count <= 1) {
    return initial
  }

  return loadWrdsFactsetRows({
    table: "factset.monthly_prices_final_usc_v3",
    limit: 24,
    offset: Math.max(initial.count - 24, 0),
    filters: { fsym_id: securityId },
  })
}

async function loadLatestFundamentals(securityId: string) {
  const initial = await loadWrdsFactsetRows({
    table: "factset.ff_advanced_af_am",
    limit: 1,
    filters: { fsym_id: securityId },
  })

  if (!initial.ok || initial.count <= 1) {
    return initial
  }

  return loadWrdsFactsetRows({
    table: "factset.ff_advanced_af_am",
    limit: 8,
    offset: Math.max(initial.count - 8, 0),
    filters: { fsym_id: securityId },
  })
}

export function WrdsDataPanel({ symbol, companyName }: WrdsDataPanelProps) {
  const [state, setState] = useState<WrdsLoadState>(emptyState)
  const [isLoading, setIsLoading] = useState(false)

  const optionEndpoints = useMemo(
    () => state.endpoints?.endpoints.filter((endpoint) => /opt|option/i.test(endpoint)) ?? [],
    [state.endpoints],
  )

  async function refreshWrdsData() {
    setIsLoading(true)
    setState((current) => ({ ...current, message: null }))

    try {
      const [endpoints, tickerPrices] = await Promise.all([loadWrdsFactsetEndpoints(), loadLatestTickerPrices(symbol)])
      const tickerRows = latestRows(tickerPrices, "price_date")
      const securityId = pickPrimarySecurity(tickerRows)
      const [prices, fundamentals] = await Promise.all([
        securityId ? loadLatestSecurityPrices(securityId) : Promise.resolve(tickerPrices),
        securityId ? loadLatestFundamentals(securityId) : Promise.resolve(null),
      ])

      setState({
        endpoints,
        prices,
        fundamentals,
        securityId,
        message: securityId ? null : "WRDS returned price rows, but no primary FactSet security id was available.",
      })
    } catch (error) {
      setState({
        ...emptyState,
        message: error instanceof Error ? error.message : "WRDS data could not be loaded.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    refreshWrdsData()
  }, [symbol])

  const priceRows = latestRows(state.prices, "price_date")
  const financialRows = latestRows(state.fundamentals, "date")

  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-2xl bg-[#0D0D0D] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[#919191]">
              <Database className="h-5 w-5" />
              <span className="text-sm">WRDS Data</span>
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-white">{companyName ?? symbol}</h2>
            <p className="mt-1 text-sm text-[#919191]">
              FactSet tables from Wharton WRDS, isolated from the dashboard market-data API.
            </p>
          </div>

          <button
            onClick={refreshWrdsData}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1A1A1A] px-3 text-sm text-white transition-colors hover:bg-[#252525]"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-3 border-t border-[#1F1F1F] pt-4 text-sm text-[#919191]">
          <span>{state.endpoints?.message ?? "Checking WRDS access."}</span>
          <span>{state.prices?.message ?? "Loading WRDS monthly prices."}</span>
          {state.securityId ? <span>FactSet security id {state.securityId}</span> : null}
        </div>

        {state.message ? (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#3A2A16] bg-[#17120A] px-4 py-3 text-sm text-[#fbbf24]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{state.message}</span>
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
        <div className="rounded-2xl bg-[#0D0D0D] p-6">
          <div className="flex items-center gap-2 text-[#919191]">
            <BarChart3 className="h-5 w-5" />
            <span className="text-sm">Stock prices</span>
          </div>
          <h3 className="mt-2 text-xl font-semibold text-white">WRDS monthly price history</h3>

          <div className="mt-5 overflow-x-auto rounded-xl border border-[#1F1F1F]">
            <table className="w-full min-w-[680px] table-fixed text-sm">
              <thead className="bg-[#151515] text-[#919191]">
                <tr>
                  <th className="w-[120px] px-4 py-3 text-left font-medium">Date</th>
                  <th className="w-[110px] px-4 py-3 text-right font-medium">Price</th>
                  <th className="w-[110px] px-4 py-3 text-right font-medium">Return</th>
                  <th className="w-[110px] px-4 py-3 text-right font-medium">Dividend</th>
                  <th className="w-[130px] px-4 py-3 text-left font-medium">Region</th>
                  <th className="px-4 py-3 text-left font-medium">Security id</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F1F1F]">
                {priceRows.length ? (
                  priceRows.slice(0, 12).map((row, index) => {
                    const currency = textValue(row, "iso_currency") === "--" ? "USD" : textValue(row, "iso_currency")

                    return (
                      <tr key={`${textValue(row, "fsym_id")}-${textValue(row, "price_date")}-${index}`}>
                        <td className="px-4 py-3 text-white">{textValue(row, "price_date")}</td>
                        <td className="px-4 py-3 text-right text-white">
                          {formatCurrency(numericValue(row, "price_m"), currency)}
                        </td>
                        <td className="px-4 py-3 text-right text-white">
                          {formatNumber(numericValue(row, "one_month_return"))}%
                        </td>
                        <td className="px-4 py-3 text-right text-white">
                          {formatCurrency(numericValue(row, "dividends"), currency)}
                        </td>
                        <td className="px-4 py-3 text-[#D7D7D7]">{textValue(row, "region")}</td>
                        <td className="px-4 py-3 text-[#D7D7D7]">{textValue(row, "primary_security")}</td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-[#919191]">
                      No WRDS price rows loaded for {symbol}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl bg-[#0D0D0D] p-6">
          <div className="flex items-center gap-2 text-[#919191]">
            <FileSpreadsheet className="h-5 w-5" />
            <span className="text-sm">Options</span>
          </div>
          <h3 className="mt-2 text-xl font-semibold text-white">WRDS options availability</h3>
          <div className="mt-5 rounded-xl border border-[#1F1F1F] px-4 py-5 text-sm text-[#919191]">
            {optionEndpoints.length ? (
              <>
                <p className="text-white">Potential options tables exposed by this token:</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {optionEndpoints.map((endpoint) => (
                    <span key={endpoint} className="rounded-lg bg-[#1A1A1A] px-3 py-2 text-[#D7D7D7]">
                      {endpoint}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              "No WRDS FactSet options table is exposed by this token. The main dashboard options panel remains connected only to the separate market-data API."
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-[#0D0D0D] p-6">
        <div className="flex items-center gap-2 text-[#919191]">
          <FileSpreadsheet className="h-5 w-5" />
          <span className="text-sm">Financial statements</span>
        </div>
        <h3 className="mt-2 text-xl font-semibold text-white">WRDS FactSet advanced fundamentals</h3>

        <div className="mt-5 overflow-x-auto rounded-xl border border-[#1F1F1F]">
          <table className="w-full min-w-[820px] table-fixed text-sm">
            <thead className="bg-[#151515] text-[#919191]">
              <tr>
                <th className="w-[120px] px-4 py-3 text-left font-medium">Fiscal date</th>
                <th className="w-[120px] px-4 py-3 text-right font-medium">EPS</th>
                <th className="w-[120px] px-4 py-3 text-right font-medium">Cash</th>
                <th className="w-[130px] px-4 py-3 text-right font-medium">LT debt</th>
                <th className="w-[140px] px-4 py-3 text-right font-medium">Operating income</th>
                <th className="w-[120px] px-4 py-3 text-right font-medium">R&D</th>
                <th className="px-4 py-3 text-right font-medium">Market value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F1F1F]">
              {financialRows.length ? (
                financialRows.map((row, index) => {
                  const currency = textValue(row, "currency") === "--" ? "USD" : textValue(row, "currency")

                  return (
                    <tr key={`${textValue(row, "fsym_id")}-${textValue(row, "date")}-${index}`}>
                      <td className="px-4 py-3 text-white">{textValue(row, "date")}</td>
                      <td className="px-4 py-3 text-right text-white">
                        {formatNumber(numericValue(row, "ff_eps"))}
                      </td>
                      <td className="px-4 py-3 text-right text-white">
                        {formatCurrency(numericValue(row, "ff_cash_generic"), currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-white">
                        {formatCurrency(numericValue(row, "ff_debt_lt_tot"), currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-white">
                        {formatCurrency(numericValue(row, "ff_oper_inc_intl"), currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-white">
                        {formatCurrency(numericValue(row, "ff_rd_exp"), currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-white">
                        {formatCurrency(numericValue(row, "ff_mkt_val_secs"), currency)}
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-[#919191]">
                    No WRDS fundamentals loaded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
