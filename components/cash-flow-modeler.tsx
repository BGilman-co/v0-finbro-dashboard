"use client"

import { useMemo, useState } from "react"
import { Download, KeyRound, Settings2, SquareArrowOutUpRight } from "lucide-react"
import { buildPreviewModel, type FinancialStatement, type ForecastCellNote } from "@/lib/cash-flow-model"
import type { Security } from "@/lib/market-types"

type CashFlowModelerProps = {
  securities: Security[]
  selectedSymbol: string
  onSymbolChange: (symbol: string) => void
}

function formatAmount(value: number, rowId: string) {
  if (rowId.startsWith("assumption-")) {
    return `${value.toFixed(1)}%`
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value)
}

function noteText(note?: ForecastCellNote) {
  if (!note) {
    return undefined
  }

  return [
    `Assumption: ${note.assumption}`,
    `Historical support: ${note.historicalSupport}`,
    `SEC filing evidence: ${note.secEvidence}`,
    `Finnhub transcript evidence: ${note.transcriptEvidence}`,
    `Confidence: ${note.confidence}`,
  ].join("\n")
}

function StatementTable({ statement }: { statement: FinancialStatement }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#1F1F1F] bg-[#0D0D0D]">
      <div className="border-b border-[#1F1F1F] px-5 py-4">
        <h2 className="text-base font-medium text-white">{statement.title}</h2>
        <p className="mt-1 text-xs text-[#919191]">Historical years are on the left. Five projected years are on the right. Hover or focus projected cells to view assumption notes.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead>
            <tr className="bg-[#111111] text-left text-xs uppercase tracking-wide text-[#919191]">
              <th className="sticky left-0 z-10 w-72 bg-[#111111] px-4 py-3 font-medium">Line item</th>
              {statement.years.map((year) => (
                <th key={year} className="px-3 py-3 text-right font-medium">
                  {year}A
                </th>
              ))}
              {statement.projectedYears.map((year) => (
                <th key={year} className="border-l border-[#1F1F1F] px-3 py-3 text-right font-medium text-[#D9F99D]">
                  {year}E
                </th>
              ))}
              <th className="w-64 px-3 py-3 font-medium">Formula</th>
            </tr>
          </thead>
          <tbody>
            {statement.lineItems.map((row) => {
              const isTotal = ["gross-profit", "operating-income", "net-income", "operating-cash-flow", "cash-change"].includes(row.id)
              const isAssumption = row.id.startsWith("assumption-")

              return (
                <tr key={row.id} className={`border-t border-[#1F1F1F] ${isTotal ? "bg-[#121612]" : ""}`}>
                  <th className={`sticky left-0 z-10 bg-inherit px-4 py-3 text-left ${isTotal ? "font-semibold text-white" : isAssumption ? "font-medium text-[#D9F99D]" : "font-normal text-[#E7E7E7]"}`}>
                    {row.label}
                  </th>
                  {statement.years.map((year, index) => (
                    <td key={year} className="px-3 py-3 text-right tabular-nums text-[#C9C9C9]">
                      {row.historical[index] === undefined ? "" : formatAmount(row.historical[index], row.id)}
                    </td>
                  ))}
                  {statement.projectedYears.map((year, index) => (
                    <td key={year} className="border-l border-[#1F1F1F] px-3 py-3 text-right">
                      <button
                        type="button"
                        title={noteText(row.notes?.[index])}
                        aria-label={`${row.label} ${year} projection note`}
                        className="w-full rounded-md px-2 py-1 text-right tabular-nums text-[#F2F2F2] outline-none transition-colors hover:bg-[#253017] focus-visible:bg-[#253017] focus-visible:ring-2 focus-visible:ring-[#D9F99D]"
                        onClick={() => {
                          const text = noteText(row.notes?.[index])
                          if (text) {
                            window.alert(text)
                          }
                        }}
                      >
                        {formatAmount(row.projected[index], row.id)}
                      </button>
                    </td>
                  ))}
                  <td className="px-3 py-3 text-xs leading-5 text-[#919191]">{row.formula}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function statementToCsv(statement: FinancialStatement) {
  const headers = ["Line item", ...statement.years.map((year) => `${year}A`), ...statement.projectedYears.map((year) => `${year}E`), "Formula"]
  const rows = statement.lineItems.map((row) => [
    row.label,
    ...statement.years.map((_, index) => row.historical[index] ?? ""),
    ...statement.projectedYears.map((_, index) => row.projected[index] ?? ""),
    row.formula ?? "",
  ])

  return [headers, ...rows]
    .map((row) =>
      row
        .map((value) => {
          const text = String(value)
          return text.includes(",") || text.includes("\n") ? `"${text.replaceAll('"', '""')}"` : text
        })
        .join(","),
    )
    .join("\n")
}

export function CashFlowModeler({ securities, selectedSymbol, onSymbolChange }: CashFlowModelerProps) {
  const [finnhubKey, setFinnhubKey] = useState("")
  const [secUserAgent, setSecUserAgent] = useState("")
  const [tickerQuery, setTickerQuery] = useState(selectedSymbol)
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([selectedSymbol])
  const [showSettings, setShowSettings] = useState(false)

  const selectedSecurity = securities.find((security) => security.symbol === selectedSymbol) ?? securities[0]
  const model = useMemo(
    () =>
      buildPreviewModel({
        ticker: selectedSecurity?.symbol ?? "AAPL",
        name: selectedSecurity?.name ?? "Apple Inc.",
        cik: selectedSecurity?.cik,
      }),
    [selectedSecurity],
  )
  const filteredSecurities = securities
    .filter((security) => `${security.symbol} ${security.name}`.toLowerCase().includes(tickerQuery.toLowerCase()))
    .slice(0, 30)

  const toggleSymbol = (symbol: string) => {
    setSelectedSymbols((current) => (current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol]))
    onSymbolChange(symbol)
  }

  const exportModel = () => {
    const prefix = `${selectedSecurity?.symbol ?? "model"}-sec-finnhub-model`
    const csv = [
      model.incomeStatement.title,
      statementToCsv(model.incomeStatement),
      "",
      model.cashFlowStatement.title,
      statementToCsv(model.cashFlowStatement),
    ].join("\n")
    const notes = {
      company: selectedSecurity,
      selectedSymbols,
      assumptions: model.assumptions,
      projectedCellNotes: [...model.incomeStatement.lineItems, ...model.cashFlowStatement.lineItems].flatMap((row) =>
        (row.notes ?? []).map((note) => ({ row: row.label, ...note })),
      ),
    }

    downloadFile(`${prefix}.csv`, csv, "text/csv")
    downloadFile(`${prefix}-cell-notes.json`, JSON.stringify(notes, null, 2), "application/json")
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl bg-[#0D0D0D] p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-wide text-[#D9F99D]">SEC EDGAR + Finnhub forecast model</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">5-year cash flow projection builder</h1>
            <p className="mt-3 text-sm leading-6 text-[#A7A7A7]">
              Select one ticker or the full stock universe, enter the Finnhub key and optional SEC User-Agent, then build a normalized filing-and-transcript-backed model. This web version stores the key only in this browser session; a native Xcode build should move that storage to Keychain.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setShowSettings((current) => !current)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#2A2A2A] px-3 text-sm text-[#E7E7E7] transition-colors hover:bg-[#171717] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9F99D]"
            >
              <Settings2 className="h-4 w-4" />
              Settings
            </button>
            <button
              type="button"
              onClick={exportModel}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#D9F99D] px-3 text-sm font-medium text-black transition-colors hover:bg-[#C8EA8A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9F99D]"
            >
              <Download className="h-4 w-4" />
              Export CSV + notes
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-xl border border-[#1F1F1F] p-4">
            <label className="text-sm font-medium text-[#E7E7E7]" htmlFor="ticker-search">
              Company ticker
            </label>
            <input
              id="ticker-search"
              value={tickerQuery}
              onChange={(event) => setTickerQuery(event.target.value.toUpperCase())}
              placeholder="AAPL, MSFT, or search all stocks"
              className="mt-2 h-10 w-full rounded-lg border border-[#2A2A2A] bg-black px-3 text-sm text-white outline-none focus:border-[#D9F99D]"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedSymbols(securities.map((security) => security.symbol))}
                className="rounded-md border border-[#2A2A2A] px-3 py-2 text-xs text-[#E7E7E7] hover:bg-[#171717]"
              >
                Select all stocks
              </button>
              <button
                type="button"
                onClick={() => setSelectedSymbols([])}
                className="rounded-md border border-[#2A2A2A] px-3 py-2 text-xs text-[#E7E7E7] hover:bg-[#171717]"
              >
                Clear
              </button>
              <span className="rounded-md bg-[#171717] px-3 py-2 text-xs text-[#A7A7A7]">{selectedSymbols.length} selected</span>
            </div>
            <div className="mt-4 grid max-h-52 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
              {filteredSecurities.map((security) => (
                <label key={security.symbol} className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#1F1F1F] p-3 text-sm text-[#E7E7E7] hover:bg-[#141414]">
                  <input
                    type="checkbox"
                    checked={selectedSymbols.includes(security.symbol)}
                    onChange={() => toggleSymbol(security.symbol)}
                    className="h-4 w-4 accent-[#D9F99D]"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{security.symbol}</span>
                    <span className="block truncate text-xs text-[#919191]">{security.name}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[#1F1F1F] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[#E7E7E7]">
              <KeyRound className="h-4 w-4" />
              Xcode prompt inputs
            </div>
            <div className="mt-3 grid gap-3">
              <input
                value={finnhubKey}
                onChange={(event) => setFinnhubKey(event.target.value)}
                type="password"
                placeholder="Finnhub API key"
                className="h-10 rounded-lg border border-[#2A2A2A] bg-black px-3 text-sm text-white outline-none focus:border-[#D9F99D]"
              />
              <input
                value={selectedSecurity?.symbol ?? selectedSymbol}
                onChange={(event) => {
                  const symbol = event.target.value.toUpperCase()
                  onSymbolChange(symbol)
                  setTickerQuery(symbol)
                }}
                placeholder="Company ticker"
                className="h-10 rounded-lg border border-[#2A2A2A] bg-black px-3 text-sm text-white outline-none focus:border-[#D9F99D]"
              />
              <input
                value={secUserAgent}
                onChange={(event) => setSecUserAgent(event.target.value)}
                placeholder="Optional SEC User-Agent email/name"
                className="h-10 rounded-lg border border-[#2A2A2A] bg-black px-3 text-sm text-white outline-none focus:border-[#D9F99D]"
              />
            </div>
            {showSettings ? (
              <div className="mt-4 rounded-lg bg-[#141414] p-3 text-xs leading-5 text-[#A7A7A7]">
                Settings screen: update the Finnhub API key here. In a native SwiftUI/Xcode version this field should persist to Keychain; this dashboard intentionally avoids storing secrets beyond the current session.
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3 text-xs text-[#A7A7A7] md:grid-cols-3">
          <a className="inline-flex items-center gap-2 rounded-lg bg-[#141414] px-3 py-2 hover:text-white" href="https://www.sec.gov/files/company_tickers.json" target="_blank" rel="noreferrer">
            CIK lookup <SquareArrowOutUpRight className="h-3 w-3" />
          </a>
          <a className="inline-flex items-center gap-2 rounded-lg bg-[#141414] px-3 py-2 hover:text-white" href={model.filings[0]?.sourceUrl} target="_blank" rel="noreferrer">
            SEC submissions <SquareArrowOutUpRight className="h-3 w-3" />
          </a>
          <a className="inline-flex items-center gap-2 rounded-lg bg-[#141414] px-3 py-2 hover:text-white" href={selectedSecurity?.cik ? `https://data.sec.gov/api/xbrl/companyfacts/CIK${selectedSecurity.cik.padStart(10, "0")}.json` : "https://data.sec.gov/api/xbrl/companyfacts/"} target="_blank" rel="noreferrer">
            Company facts <SquareArrowOutUpRight className="h-3 w-3" />
          </a>
        </div>
      </section>

      <StatementTable statement={model.incomeStatement} />
      <StatementTable statement={model.cashFlowStatement} />
    </div>
  )
}
