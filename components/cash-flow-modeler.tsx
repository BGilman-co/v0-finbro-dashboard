"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarClock, Download, FileKey2, RefreshCw, SquareArrowOutUpRight } from "lucide-react"
import { buildPreviewModel, type FinancialStatement, type ForecastAssumption, type ForecastCellNote, type ScenarioName } from "@/lib/cash-flow-model"
import { loadEarningsStatus } from "@/lib/static-market-data"
import type { FinnhubEarningsPayload } from "@/lib/finnhub-data"
import type { Security } from "@/lib/market-types"

type CashFlowModelerProps = {
  securities: Security[]
  selectedSymbol: string
  onSymbolChange: (symbol: string) => void
}

type ActiveNote = {
  rowLabel: string
  year: number
  note: ForecastCellNote
  movement: string
}

function formatAmount(value: number, rowId: string) {
  if (!Number.isFinite(value)) {
    return ""
  }

  if (rowId.startsWith("assumption-")) {
    if (value === 0) {
      return ""
    }

    return `${value.toFixed(1)}%`
  }

  if (rowId === "diluted-eps") {
    return value.toFixed(2)
  }

  if (rowId.includes("diluted-eps")) {
    return value.toFixed(2)
  }

  if (rowId === "diluted-shares") {
    return value.toFixed(1)
  }

  if (rowId.includes("variance")) {
    return `${value.toFixed(1)}%`
  }

  if (rowId.includes("check")) {
    return value.toFixed(1)
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
    `Math: ${note.formula}`,
    `Evidence: ${note.citations.join(" ")}`,
    `Confidence: ${note.confidence}`,
  ].join("\n")
}

function compactText(value: string, maxLength = 160) {
  const compact = value.replace(/\s+/g, " ").trim()

  if (compact.length <= maxLength) {
    return compact
  }

  return `${compact.slice(0, maxLength - 1).trim()}...`
}

function movementText(rowLabel: string, current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return "No prior-year bridge available."
  }

  const change = current - previous
  const direction = change > 0 ? "increased" : change < 0 ? "decreased" : "was flat"
  const amount = Math.abs(change)
  const percent = previous === 0 ? null : (change / Math.abs(previous)) * 100
  const formattedAmount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(amount)
  const formattedPercent = percent === null ? "" : ` / ${Math.abs(percent).toFixed(1)}%`

  return `${rowLabel} ${direction} ${formattedAmount}${formattedPercent} vs prior year.`
}

function StatementTable({
  statement,
  onOpenNote,
}: {
  statement: FinancialStatement
  onOpenNote: (note: ActiveNote) => void
}) {
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
              const isTotal = ["gross-profit", "operating-income", "pretax-income", "net-income", "operating-cash-flow", "free-cash-flow", "investing-cash-flow", "financing-cash-flow", "net-change-cash", "ending-cash"].includes(row.id)
              const isAssumption = row.id.startsWith("assumption-")
              const hasProjectedError = row.projected.some((value) => {
                if (!Number.isFinite(value)) {
                  return false
                }

                return row.id.includes("variance") ? Math.abs(value) > 10 : row.id.includes("check") && Math.abs(value) > 0.1
              })

              return (
                <tr key={row.id} className={`border-t border-[#1F1F1F] ${isTotal ? "bg-[#121612]" : ""}`}>
                  <th className={`sticky left-0 z-10 bg-inherit px-4 py-3 text-left ${isTotal ? "font-semibold text-white" : isAssumption ? "font-medium text-[#D9F99D]" : "font-normal text-[#E7E7E7]"}`}>
                    {row.label}
                  </th>
                  {statement.years.map((year, index) => (
                    <td key={year} className="px-3 py-3 text-right tabular-nums text-[#C9C9C9]">
                      {row.historical[index] === undefined || !Number.isFinite(row.historical[index]) ? "" : formatAmount(row.historical[index], row.id)}
                    </td>
                  ))}
                  {statement.projectedYears.map((year, index) => (
                    <td key={year} className="border-l border-[#1F1F1F] px-3 py-3 text-right">
                      <button
                        type="button"
                        title={noteText(row.notes?.[index])}
                        aria-label={`${row.label} ${year} projection note`}
                        className={`w-full rounded-md px-2 py-1 text-right tabular-nums outline-none transition-colors hover:bg-[#253017] focus-visible:bg-[#253017] focus-visible:ring-2 focus-visible:ring-[#D9F99D] ${hasProjectedError ? "text-[#FCA5A5]" : "text-[#F2F2F2]"}`}
                        onClick={() => {
                          const note = row.notes?.[index]
                          if (note) {
                            const previous = index === 0 ? row.historical[row.historical.length - 1] : row.projected[index - 1]
                            onOpenNote({ rowLabel: row.label, year, note, movement: movementText(row.label, row.projected[index], previous) })
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

function NoteDialog({ activeNote, onClose }: { activeNote: ActiveNote | null; onClose: () => void }) {
  if (!activeNote) {
    return null
  }

  const citations = activeNote.note.citations.length
    ? activeNote.note.citations
    : [activeNote.note.secEvidence, activeNote.note.transcriptEvidence].filter(Boolean)

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full justify-end bg-black/20 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-labelledby="forecast-note-title">
      <div className="h-full w-full max-w-[360px] overflow-hidden border-l border-[#2A2A2A] bg-[#0D0D0D] shadow-2xl">
        <div className="border-b border-[#1F1F1F] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[#D9F99D]">{activeNote.year} note</p>
              <h2 id="forecast-note-title" className="truncate text-base font-semibold text-white">
                {activeNote.rowLabel}
              </h2>
            </div>
            <button type="button" onClick={onClose} className="h-8 rounded-md border border-[#2A2A2A] px-2 text-xs text-[#C9C9C9] hover:bg-[#171717] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9F99D]">
              Close
            </button>
          </div>
          <div className="mt-3 inline-flex rounded-md bg-[#171717] px-2 py-1 text-[11px] text-[#A7A7A7]">
            Confidence: <span className="ml-1 text-[#E7E7E7]">{activeNote.note.confidence}</span>
          </div>
        </div>
        <div className="h-[calc(100%-92px)] overflow-y-auto px-4 py-3">
          <section className="rounded-lg border border-[#1F1F1F] bg-black/30 p-3">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-[#919191]">Math</h3>
            <p className="mt-1 text-sm leading-5 text-[#E7E7E7]">{activeNote.movement}</p>
            <p className="mt-2 font-mono text-xs leading-5 text-[#D9F99D]">{compactText(activeNote.note.formula, 120)}</p>
          </section>

          <section className="mt-3 rounded-lg border border-[#1F1F1F] bg-black/30 p-3">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-[#919191]">Key figures</h3>
            <ul className="mt-2 space-y-1 text-sm leading-5 text-[#E7E7E7]">
              {activeNote.note.figures.map((figure) => (
                <li key={figure}>{compactText(figure, 90)}</li>
              ))}
            </ul>
          </section>

          <section className="mt-3 rounded-lg border border-[#1F1F1F] bg-black/30 p-3">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-[#919191]">Source snippets</h3>
            <ul className="mt-2 space-y-2 text-xs leading-5 text-[#C9C9C9]">
              {citations.slice(0, 3).map((citation) => (
                <li key={citation}>{compactText(citation, 155)}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}

function AssumptionsTable({ assumptions }: { assumptions: ForecastAssumption[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#1F1F1F] bg-[#0D0D0D]">
      <div className="border-b border-[#1F1F1F] px-5 py-4">
        <h2 className="text-base font-medium text-white">Assumptions</h2>
        <p className="mt-1 text-xs text-[#919191]">Each forecast driver is tied to a source document, disclosure summary, modeled assumption, affected line item, and projection period.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            <tr className="bg-[#111111] text-left text-xs uppercase tracking-wide text-[#919191]">
              <th className="w-48 px-4 py-3 font-medium">Driver</th>
              <th className="w-56 px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Disclosure</th>
              <th className="px-4 py-3 font-medium">Assumption used</th>
              <th className="w-48 px-4 py-3 font-medium">Line item</th>
              <th className="w-36 px-4 py-3 font-medium">Period</th>
            </tr>
          </thead>
          <tbody>
            {assumptions.map((assumption) => (
              <tr key={assumption.id} className="border-t border-[#1F1F1F]">
                <th className="px-4 py-3 text-left align-top font-medium text-white">{assumption.label}</th>
                <td className="px-4 py-3 align-top text-xs leading-5 text-[#A7A7A7]">
                  <a href={assumption.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#D9F99D] hover:text-white">
                    {assumption.sourceDocument}
                    <SquareArrowOutUpRight className="h-3 w-3" />
                  </a>
                  <div className="mt-1 text-[#919191]">Confidence: {assumption.confidence}</div>
                </td>
                <td className="px-4 py-3 align-top text-xs leading-5 text-[#C9C9C9]">{assumption.disclosure}</td>
                <td className="px-4 py-3 align-top text-xs leading-5 text-[#C9C9C9]">{assumption.assumptionUsed}</td>
                <td className="px-4 py-3 align-top text-xs leading-5 text-[#C9C9C9]">{assumption.affectedLineItem}</td>
                <td className="px-4 py-3 align-top text-xs leading-5 text-[#C9C9C9]">{assumption.projectionPeriod}</td>
              </tr>
            ))}
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
    ...statement.years.map((_, index) => (Number.isFinite(row.historical[index]) ? row.historical[index] : "")),
    ...statement.projectedYears.map((_, index) => (Number.isFinite(row.projected[index]) ? row.projected[index] : "")),
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
  const [tickerQuery, setTickerQuery] = useState(selectedSymbol)
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([selectedSymbol])
  const [earningsStatus, setEarningsStatus] = useState<FinnhubEarningsPayload | null>(null)
  const [isCheckingEarnings, setIsCheckingEarnings] = useState(false)
  const [selectedScenario, setSelectedScenario] = useState<ScenarioName>("base")
  const [activeNote, setActiveNote] = useState<ActiveNote | null>(null)

  const selectedSecurity = securities.find((security) => security.symbol === selectedSymbol) ?? securities[0]
  const model = useMemo(
    () =>
      buildPreviewModel({
        ticker: selectedSecurity?.symbol ?? "AAPL",
        name: selectedSecurity?.name ?? "Apple Inc.",
        cik: selectedSecurity?.cik,
      }, selectedScenario),
    [selectedScenario, selectedSecurity],
  )
  const filteredSecurities = securities
    .filter((security) => `${security.symbol} ${security.name}`.toLowerCase().includes(tickerQuery.toLowerCase()))
    .slice(0, 30)

  const toggleSymbol = (symbol: string) => {
    setSelectedSymbols((current) => (current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol]))
    onSymbolChange(symbol)
  }

  useEffect(() => {
    let isMounted = true

    async function refreshEarningsStatus() {
      const symbol = selectedSecurity?.symbol ?? selectedSymbol

      if (!symbol) {
        return
      }

      setIsCheckingEarnings(true)

      try {
        const payload = await loadEarningsStatus(symbol)

        if (isMounted) {
          setEarningsStatus(payload)
        }
      } finally {
        if (isMounted) {
          setIsCheckingEarnings(false)
        }
      }
    }

    refreshEarningsStatus()
    const interval = window.setInterval(refreshEarningsStatus, 30 * 60 * 1000)

    return () => {
      isMounted = false
      window.clearInterval(interval)
    }
  }, [selectedSecurity?.symbol, selectedSymbol])

  const exportModel = () => {
    const prefix = `${selectedSecurity?.symbol ?? "model"}-sec-finnhub-model`
    const csv = [
      model.incomeStatement.title,
      statementToCsv(model.incomeStatement),
      "",
      model.cashFlowStatement.title,
      statementToCsv(model.cashFlowStatement),
      "",
      model.conventionalProjectionStatement.title,
      statementToCsv(model.conventionalProjectionStatement),
      "",
      model.validationStatement.title,
      statementToCsv(model.validationStatement),
    ].join("\n")
    const notes = {
      company: selectedSecurity,
      selectedSymbols,
      assumptions: model.assumptions,
      scenario: model.selectedScenario,
      projectedCellNotes: [...model.incomeStatement.lineItems, ...model.cashFlowStatement.lineItems, ...model.conventionalProjectionStatement.lineItems].flatMap((row) =>
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
              Select one ticker or the full stock universe, then build a normalized filing-and-transcript-backed model. Forecasts use linked formulas, source-backed assumptions, and validation checks across the income statement and cash flow statement.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
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

        <div className="mt-5 rounded-xl border border-[#1F1F1F] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-medium text-[#E7E7E7]">Scenario</div>
              <p className="mt-1 text-xs leading-5 text-[#A7A7A7]">Revenue, margin, cash conversion, capex, tax, buybacks, and share count flow through the full model.</p>
            </div>
            <div className="inline-flex rounded-lg border border-[#2A2A2A] bg-black p-1">
              {model.scenarios.map((scenario) => (
                <button
                  key={scenario.name}
                  type="button"
                  onClick={() => setSelectedScenario(scenario.name)}
                  className={`h-9 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9F99D] ${selectedScenario === scenario.name ? "bg-[#D9F99D] text-black" : "text-[#C9C9C9] hover:bg-[#171717]"}`}
                >
                  {scenario.label}
                </button>
              ))}
            </div>
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
              <FileKey2 className="h-4 w-4" />
              Environment inputs
            </div>
            <div className="mt-3 rounded-lg bg-[#141414] p-3 text-xs leading-5 text-[#A7A7A7]">
              `FINNHUB_API_KEY` is read from `.env.local` by server routes. Add `SEC_USER_AGENT` when you want a custom SEC-compliant request identity. The browser only receives modeled output, not the raw key.
            </div>
            <div className="mt-3 rounded-lg border border-[#1F1F1F] p-3">
              <div className="text-xs uppercase tracking-wide text-[#919191]">Active company</div>
              <div className="mt-1 text-lg font-semibold text-white">{selectedSecurity?.symbol ?? selectedSymbol}</div>
              <div className="mt-1 text-sm text-[#A7A7A7]">{selectedSecurity?.name ?? "Select a company from the universe list"}</div>
            </div>
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

        <div className="mt-5 rounded-xl border border-[#1F1F1F] bg-[#111111] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <CalendarClock className="mt-0.5 h-5 w-5 text-[#D9F99D]" />
              <div>
                <div className="text-sm font-medium text-white">Automatic earnings and call refresh</div>
                <p className="mt-1 text-xs leading-5 text-[#A7A7A7]">
                  The app checks Finnhub’s earnings calendar for this ticker every 30 minutes while the page is open. Vercel also calls the calendar monitor hourly so newly published earnings releases and call transcript metadata can trigger a model refresh path.
                </p>
              </div>
            </div>
            <div className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs ${earningsStatus?.shouldRefreshModel ? "bg-[#253017] text-[#D9F99D]" : "bg-[#171717] text-[#A7A7A7]"}`}>
              <RefreshCw className={`h-3.5 w-3.5 ${isCheckingEarnings ? "animate-spin" : ""}`} />
              {earningsStatus?.provider === "Unavailable"
                ? "Calendar unavailable"
                : earningsStatus?.shouldRefreshModel
                  ? "Refresh signal active"
                  : isCheckingEarnings
                    ? "Checking calendar"
                    : "Calendar watch active"}
            </div>
          </div>
          <div className="mt-4 grid gap-3 text-xs text-[#A7A7A7] md:grid-cols-3">
            <div className="rounded-lg bg-black/40 p-3">
              <div className="text-[#919191]">Last check</div>
              <div className="mt-1 text-[#E7E7E7]">{earningsStatus?.updatedAt ? new Date(earningsStatus.updatedAt).toLocaleString() : "Waiting for Finnhub"}</div>
            </div>
            <div className="rounded-lg bg-black/40 p-3">
              <div className="text-[#919191]">Calendar events {earningsStatus?.earningsCalendarAvailable ? "" : "(blocked)"}</div>
              <div className="mt-1 text-[#E7E7E7]">{earningsStatus?.earningsEvents.length ?? 0} in the +/- 14 day window</div>
            </div>
            <div className="rounded-lg bg-black/40 p-3">
              <div className="text-[#919191]">Call transcripts {earningsStatus?.transcriptsAvailable ? "" : "(blocked)"}</div>
              <div className="mt-1 text-[#E7E7E7]">{earningsStatus?.transcripts.length ?? 0} recent metadata records</div>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-[#A7A7A7]">
            {earningsStatus?.provider === "Unavailable"
              ? earningsStatus.message
              : earningsStatus?.refreshReason ?? "Calendar watch is initializing."}
          </p>
        </div>
      </section>

      <AssumptionsTable assumptions={model.assumptions} />
      <StatementTable statement={model.incomeStatement} onOpenNote={setActiveNote} />
      <StatementTable statement={model.cashFlowStatement} onOpenNote={setActiveNote} />
      <StatementTable statement={model.conventionalProjectionStatement} onOpenNote={setActiveNote} />
      <StatementTable statement={model.validationStatement} onOpenNote={setActiveNote} />
      <NoteDialog activeNote={activeNote} onClose={() => setActiveNote(null)} />
    </div>
  )
}
