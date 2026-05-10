"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { TickerList, type SortKey } from "@/components/ticker-list"
import { Sidebar, type NavItem } from "@/components/sidebar"
import { Header } from "@/components/header"
import { MarketIntelligence } from "@/components/market-intelligence"
import { PerformanceChart } from "@/components/performance-chart"
import { holdings } from "@/lib/portfolio-data"
import type { FilingsPayload, MarketPayload, Security } from "@/lib/market-types"

type UniversePayload = {
  securities: Security[]
  count: number
  provider: string
  updatedAt: string
}

function ViewPanel({ activeView }: { activeView: NavItem }) {
  const panels: Record<NavItem, { title: string; detail: string }> = {
    dashboard: {
      title: "Market Database",
      detail: "S&P 500 universe, Alpha Vantage quotes, SEC EDGAR filings, and XBRL statement tables.",
    },
    analytics: {
      title: "Analytics",
      detail: "Compare securities by movement, sector, filing coverage, and statement data.",
    },
    arbitrader: {
      title: "Screener",
      detail: "Filter the S&P 500 universe by symbol, company, sector, quote status, and filings.",
    },
    researcher: {
      title: "Researcher",
      detail: "Select any company to pull recent 10-K/10-Q filings and structured SEC financial facts.",
    },
    funds: {
      title: "Datasets",
      detail: "Live sources include Alpha Vantage market data and official SEC EDGAR APIs.",
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
  const [selectedSymbol, setSelectedSymbol] = useState("AAPL")
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("symbol")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [universe, setUniverse] = useState<UniversePayload | null>(null)
  const [marketData, setMarketData] = useState<MarketPayload | null>(null)
  const [filingsData, setFilingsData] = useState<FilingsPayload | null>(null)
  const [isMarketLoading, setIsMarketLoading] = useState(true)

  const securities = universe?.securities.length
    ? universe.securities
    : holdings.map((holding) => ({
        symbol: holding.id,
        name: holding.name,
        sector: holding.sector,
        exchange: holding.exchange,
      }))
  const selectedSecurity = securities.find((security) => security.symbol === selectedSymbol) ?? securities[0]
  const quoteSymbols = useMemo(() => {
    return securities.map((security) => security.symbol)
  }, [securities])

  useEffect(() => {
    let isMounted = true

    async function loadUniverse() {
      const response = await fetch("/api/universe", { cache: "no-store" })

      if (response.ok && isMounted) {
        const payload = (await response.json()) as UniversePayload
        setUniverse(payload)

        if (!payload.securities.some((security) => security.symbol === selectedSymbol)) {
          setSelectedSymbol(payload.securities[0]?.symbol ?? "AAPL")
        }
      }
    }

    loadUniverse()

    return () => {
      isMounted = false
    }
  }, [])

  const refreshMarketData = useCallback(async () => {
    setIsMarketLoading(true)

    try {
      const symbols = quoteSymbols.join(",")
      const response = await fetch(`/api/market?symbols=${encodeURIComponent(symbols)}&optionSymbol=${selectedSymbol}`, {
        cache: "no-store",
      })

      if (response.ok) {
        setMarketData((await response.json()) as MarketPayload)
      }
    } finally {
      setIsMarketLoading(false)
    }
  }, [quoteSymbols, selectedSymbol])

  useEffect(() => {
    refreshMarketData()
    const interval = window.setInterval(refreshMarketData, 60_000)

    return () => window.clearInterval(interval)
  }, [refreshMarketData])

  useEffect(() => {
    let isMounted = true

    async function loadFilings() {
      const response = await fetch(`/api/filings?symbol=${selectedSymbol}`, {
        cache: "no-store",
      })

      if (response.ok && isMounted) {
        setFilingsData((await response.json()) as FilingsPayload)
      }
    }

    setFilingsData(null)
    loadFilings()

    return () => {
      isMounted = false
    }
  }, [selectedSymbol])

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSortKey(key)
    setSortDirection(["symbol", "company", "sector"].includes(key) ? "asc" : "desc")
  }

  const notifyUnavailable = (feature: string) => {
    window.alert(`${feature} is connected to the market data and SEC source workflow.`)
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black text-white">
      <Header
        onSettings={() => notifyUnavailable("Settings")}
        onLogout={() => notifyUnavailable("Sources")}
      />

      <div className="h-full overflow-y-auto no-scrollbar">
        <main className="flex min-h-full gap-6 p-6 pt-24">
          <Sidebar activeItem={activeView} onNavigate={setActiveView} onSupport={() => window.location.href = "mailto:support@bgilman.co"} />

          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <ViewPanel activeView={activeView} />
            <PerformanceChart
              securities={securities}
              symbol={selectedSecurity?.symbol ?? selectedSymbol}
              onSymbolChange={(symbol) => {
                setSelectedSymbol(symbol)
                setActiveView("dashboard")
              }}
            />
            <TickerList
              securities={securities}
              quotes={marketData?.quotes ?? []}
              selectedSymbol={selectedSecurity?.symbol ?? selectedSymbol}
              search={search}
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSearchChange={setSearch}
              onSelect={(symbol) => {
                setSelectedSymbol(symbol)
                setActiveView("dashboard")
              }}
              onSort={handleSort}
            />
            <MarketIntelligence
              symbol={selectedSecurity?.symbol ?? selectedSymbol}
              market={marketData}
              filings={filingsData}
              isLoading={isMarketLoading}
              onRefresh={refreshMarketData}
            />

            <div className="mt-4 flex items-center justify-end gap-2">
              <div className={`h-[13px] w-[13px] rounded-full ${marketData?.isLive ? "bg-[#86efac]" : "bg-[#f59e0b]"}`} />
              <span className="text-sm text-[#919191]">
                {marketData?.provider ?? "Connecting"} · {universe?.provider ?? "Loading S&P 500 universe"}
              </span>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
