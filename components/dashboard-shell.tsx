"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { TickerList, type SortKey } from "@/components/ticker-list"
import { Sidebar, type NavItem } from "@/components/sidebar"
import { Header } from "@/components/header"
import { MarketIntelligence } from "@/components/market-intelligence"
import { NetflixValuationResearch } from "@/components/netflix-valuation-research"
import { PerformanceChart } from "@/components/performance-chart"
import { holdings } from "@/lib/portfolio-data"
import { loadFilings, loadMarketData, loadSp500Universe, type UniversePayload } from "@/lib/static-market-data"
import type { FilingsPayload, MarketPayload } from "@/lib/market-types"

function ViewPanel({ activeView }: { activeView: NavItem }) {
  const panels: Record<NavItem, { title: string; detail: string }> = {
    dashboard: {
      title: "Market Database",
      detail: "S&P 500 universe, yfinance market snapshots, SEC EDGAR filings, and XBRL statement tables.",
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
      detail: "Netflix real-options valuation model built from the provided workbook, research notes, yfinance, Monte Carlo simulation, decision trees, and Black-Scholes approximations.",
    },
    funds: {
      title: "Datasets",
      detail: "Market data is generated from yfinance/Yahoo Finance snapshots and official SEC EDGAR APIs.",
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

function MobileNav({ activeView, onNavigate }: { activeView: NavItem; onNavigate: (item: NavItem) => void }) {
  const items: Array<{ id: NavItem; label: string }> = [
    { id: "dashboard", label: "Database" },
    { id: "analytics", label: "Analytics" },
    { id: "arbitrader", label: "Screener" },
    { id: "researcher", label: "Researcher" },
    { id: "funds", label: "Datasets" },
  ]

  return (
    <div className="md:hidden px-6 pt-24">
      <div className="flex gap-2 overflow-x-auto rounded-xl bg-[#0D0D0D] p-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`h-9 shrink-0 rounded-lg px-3 text-sm transition-colors ${
              activeView === item.id ? "bg-[#1F1F1F] text-white" : "text-[#919191]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
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

  const securities = useMemo(
    () =>
      universe?.securities.length
        ? universe.securities
        : holdings.map((holding) => ({
            symbol: holding.id,
            name: holding.name,
            sector: holding.sector,
            exchange: holding.exchange,
          })),
    [universe],
  )
  const selectedSecurity = securities.find((security) => security.symbol === selectedSymbol) ?? securities[0]
  const quoteSymbols = useMemo(() => {
    return securities.map((security) => security.symbol)
  }, [securities])

  useEffect(() => {
    const hash = window.location.hash.replace("#", "") as NavItem
    if (["dashboard", "analytics", "arbitrader", "researcher", "funds"].includes(hash)) {
      setActiveView(hash)
    }
  }, [])

  const handleNavigate = (item: NavItem) => {
    setActiveView(item)
    window.history.replaceState(null, "", `#${item}`)
  }

  useEffect(() => {
    let isMounted = true

    async function loadUniverse() {
      const payload = await loadSp500Universe()

      if (isMounted) {
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
      setMarketData(await loadMarketData(quoteSymbols, selectedSymbol))
    } finally {
      setIsMarketLoading(false)
    }
  }, [quoteSymbols, selectedSymbol])

  useEffect(() => {
    refreshMarketData()
    const interval = window.setInterval(refreshMarketData, 55_000)

    return () => window.clearInterval(interval)
  }, [refreshMarketData])

  useEffect(() => {
    let isMounted = true

    async function refreshFilings() {
      const payload = await loadFilings(selectedSymbol)

      if (isMounted) {
        setFilingsData(payload)
      }
    }

    setFilingsData(null)
    refreshFilings()

    return () => {
      isMounted = false
    }
  }, [selectedSymbol, securities])

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

  const handleLogin = () => {
    window.location.href = "/login"
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black text-white">
      <Header
        accountActionLabel="Log in"
        onSettings={() => notifyUnavailable("Settings")}
        onAccountAction={handleLogin}
      />

      <div className="h-full overflow-y-auto no-scrollbar">
        <MobileNav activeView={activeView} onNavigate={handleNavigate} />
        <main className="flex min-h-full gap-6 p-6 pt-6 md:pt-24">
          <Sidebar activeItem={activeView} onNavigate={handleNavigate} onSupport={() => window.location.href = "mailto:support@bgilman.co"} />

          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <ViewPanel activeView={activeView} />
            {activeView === "researcher" ? (
              <NetflixValuationResearch />
            ) : (
              <>
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
              </>
            )}

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
