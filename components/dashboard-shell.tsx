"use client"

import { useMemo, useState } from "react"
import { DashboardMetrics } from "@/components/dashboard-metrics"
import { PerformanceChart } from "@/components/performance-chart"
import { TickerList, type SortKey } from "@/components/ticker-list"
import { Sidebar, type NavItem } from "@/components/sidebar"
import { Header } from "@/components/header"
import { holdings, type Period } from "@/lib/portfolio-data"

function ViewPanel({ activeView }: { activeView: NavItem }) {
  const panels: Record<NavItem, { title: string; detail: string }> = {
    dashboard: {
      title: "Market Database",
      detail: "Searchable equities, price history, fundamentals, filings, and source coverage.",
    },
    analytics: {
      title: "Analytics",
      detail: "Compare securities by movement, market cap, valuation, sector, and source coverage.",
    },
    arbitrader: {
      title: "Screener",
      detail: "Filter market records by sector, exchange, valuation, volume, and price action.",
    },
    researcher: {
      title: "Researcher",
      detail: "Research mode can pull news, filings, and analyst data once a data source is connected.",
    },
    funds: {
      title: "Datasets",
      detail: "Manage quote, fundamentals, filings, macro, and alternative-data source tables.",
    },
  }

  const panel = panels[activeView]

  if (activeView === "dashboard") {
    return null
  }

  return (
    <section className="rounded-2xl bg-[#0D0D0D] p-6">
      <h2 className="text-xl font-medium text-white">{panel.title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#919191]">{panel.detail}</p>
    </section>
  )
}

function DataSourcePanel({ symbol }: { symbol: string }) {
  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
      <div className="rounded-2xl bg-[#0D0D0D] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-[#919191]">Reference Dataset</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{symbol} market record</h2>
          </div>
          <span className="rounded-lg bg-[#1A1A1A] px-3 py-2 text-sm text-[#86efac]">Static sample</span>
        </div>

        <div className="mt-5 grid gap-3 border-t border-[#1F1F1F] pt-4 sm:grid-cols-3">
          <div>
            <span className="text-xs text-[#919191]">Coverage</span>
            <p className="mt-1 text-sm text-white">Daily prices, 1D view, fundamentals</p>
          </div>
          <div>
            <span className="text-xs text-[#919191]">Source Type</span>
            <p className="mt-1 text-sm text-white">Local reference table</p>
          </div>
          <div>
            <span className="text-xs text-[#919191]">Next Step</span>
            <p className="mt-1 text-sm text-white">Connect a market-data provider</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-[#0D0D0D] p-6">
        <p className="text-sm text-[#919191]">Database Modules</p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          {["Prices", "Fundamentals", "Filings", "Options"].map((module) => (
            <div key={module} className="rounded-lg border border-[#1F1F1F] px-3 py-3 text-white">
              {module}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function DashboardShell() {
  const [activeView, setActiveView] = useState<NavItem>("dashboard")
  const [selectedSymbol, setSelectedSymbol] = useState("TSLA")
  const [period, setPeriod] = useState<Period>("6M")
  const [sortKey, setSortKey] = useState<SortKey>("marketCap")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

  const selectedHolding = holdings.find((holding) => holding.id === selectedSymbol) ?? holdings[0]

  const databaseStats = useMemo(() => {
    return {
      symbols: holdings.length,
      records: holdings.reduce((total, holding) => total + holding.history.length, 0),
      sectors: new Set(holdings.map((holding) => holding.sector)).size,
      datasets: 4,
    }
  }, [])

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSortKey(key)
    setSortDirection(["symbol", "company", "sector"].includes(key) ? "asc" : "desc")
  }

  const notifyUnavailable = (feature: string) => {
    window.alert(`${feature} needs a connected data source first.`)
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black text-white">
      <Header
        onSettings={() => notifyUnavailable("Settings")}
        onLogout={() => notifyUnavailable("Data sources")}
      />

      <div className="h-full overflow-y-auto no-scrollbar">
        <main className="flex min-h-full gap-6 p-6 pt-24">
          <Sidebar activeItem={activeView} onNavigate={setActiveView} onSupport={() => window.location.href = "mailto:support@bgilman.co"} />

          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <ViewPanel activeView={activeView} />
            <DashboardMetrics stats={databaseStats} />
            <PerformanceChart
              holding={selectedHolding}
              period={period}
              onPeriodChange={setPeriod}
            />
            <TickerList
              holdings={holdings}
              selectedSymbol={selectedSymbol}
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSelect={(symbol) => {
                setSelectedSymbol(symbol)
                setActiveView("dashboard")
              }}
              onSort={handleSort}
            />
            <DataSourcePanel symbol={selectedSymbol} />

            <div className="mt-4 flex items-center justify-end gap-2">
              <div className="h-[13px] w-[13px] rounded-full bg-[#f59e0b]" />
              <span className="text-sm text-[#919191]">Reference database mode</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
