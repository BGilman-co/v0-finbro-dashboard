"use client"

import { useMemo, useState } from "react"
import { DashboardMetrics } from "@/components/dashboard-metrics"
import { PerformanceChart } from "@/components/performance-chart"
import { TickerList, type SortKey } from "@/components/ticker-list"
import { Sidebar, type NavItem } from "@/components/sidebar"
import { Header } from "@/components/header"
import { holdings, type Period, getHoldingStats } from "@/lib/portfolio-data"

function ViewPanel({ activeView }: { activeView: NavItem }) {
  const panels: Record<NavItem, { title: string; detail: string }> = {
    dashboard: {
      title: "Dashboard",
      detail: "Portfolio overview, performance, and current positions.",
    },
    analytics: {
      title: "Analytics",
      detail: "Compare holdings by return, position size, and daily movement.",
    },
    arbitrader: {
      title: "Arbitrader",
      detail: "Strategy controls are ready for a broker or market-data integration.",
    },
    researcher: {
      title: "Researcher",
      detail: "Research mode can pull news, filings, and analyst data once a data source is connected.",
    },
    funds: {
      title: "Funds",
      detail: "Cash, deposits, and withdrawals can be connected to a brokerage or manual ledger.",
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

export function DashboardShell() {
  const [activeView, setActiveView] = useState<NavItem>("dashboard")
  const [selectedSymbol, setSelectedSymbol] = useState("TSLA")
  const [period, setPeriod] = useState<Period>("6M")
  const [sortKey, setSortKey] = useState<SortKey>("current")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

  const selectedHolding = holdings.find((holding) => holding.id === selectedSymbol) ?? holdings[0]

  const portfolioStats = useMemo(() => {
    return holdings.reduce(
      (totals, holding) => {
        const stats = getHoldingStats(holding)

        return {
          current: totals.current + stats.current,
          invested: totals.invested + stats.invested,
          returns: totals.returns + stats.returns,
          oneDayReturns: totals.oneDayReturns + stats.oneDayReturns,
        }
      },
      { current: 0, invested: 0, returns: 0, oneDayReturns: 0 },
    )
  }, [])

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSortKey(key)
    setSortDirection(key === "company" ? "asc" : "desc")
  }

  const notifyUnavailable = (feature: string) => {
    window.alert(`${feature} needs a connected account or live data provider first.`)
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black text-white">
      <Header
        onSettings={() => notifyUnavailable("Settings")}
        onLogout={() => notifyUnavailable("Logout")}
      />

      <div className="h-full overflow-y-auto no-scrollbar">
        <main className="flex min-h-full gap-6 p-6 pt-24">
          <Sidebar activeItem={activeView} onNavigate={setActiveView} onSupport={() => window.location.href = "mailto:support@finbro.local"} />

          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <ViewPanel activeView={activeView} />
            <DashboardMetrics stats={portfolioStats} />
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

            <div className="mt-4 flex items-center justify-end gap-2">
              <div className="h-[13px] w-[13px] rounded-full bg-[#86efac]" />
              <span className="text-sm text-[#919191]">Sample data active</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
