"use client"

import { useEffect, useMemo, useState } from "react"
import { GitBranch, LineChart, Network, Sigma, Table2 } from "lucide-react"
import { formatCurrency } from "@/lib/portfolio-data"

type PercentileMap = Record<string, number>

type NetflixValuation = {
  company: string
  ticker: string
  updatedAt: string
  sources: string[]
  assumptions: {
    revenueGrowthStdev: number
    terminalRevenueGrowth: number
    retentionRate: number
    monthlyChurn: number
    weightedAverageSubscriptionPrice: number
    nopatMarginStdev: number
    wacc: number
    waccStdev: number
    terminalGrowthUsed: number
    fcfConversionOfNopat: number
    trials: number
  }
  forecast: Array<{
    year: number
    subscriberGrowth: number
    priceGrowth: number
    retentionRate: number
    baseRevenueGrowth: number
    baseRevenue: number
    nopatMargin: number
    freeCashFlow: number
  }>
  valuation: {
    marketPrice: number
    sharesMM: number
    traditionalDcfPerShare: PercentileMap
    optionAdjustedPerShare: PercentileMap
    meanTraditionalPerShare: number
    meanOptionAdjustedPerShare: number
    meanOptionValuePerShare: number
    optionValueTotalMM: number
  }
  options: {
    expansionOptions: Array<{
      name: string
      underlying: number
      strike: number
      sigma: number
      years: number
      probability: number
      blackScholesValue: number
      expectedValue: number
    }>
    abandonmentOptionValueMM: number
    delayedInvestmentOptionValueMM: number
    dynamicCapitalAllocationValueMM: number
    expectedStrategicValueContributionMM: number
  }
  sensitivitySurface: {
    wacc: number[]
    terminalGrowth: number[]
    values: number[][]
  }
  intrinsicValueDistribution: {
    binEdges: number[]
    counts: number[]
  }
  scenarioTree: {
    nodes: Array<{ id: string; x: number; y: number }>
    edges: Array<{ source: string; target: string; probability: number; value: number }>
  }
  notes: string[]
}

const appBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function compactMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value * 1_000_000)
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-[#1F1F1F] bg-[#101010] p-4">
      <p className="text-xs uppercase tracking-wide text-[#777]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {detail ? <p className="mt-1 text-xs text-[#919191]">{detail}</p> : null}
    </div>
  )
}

function Histogram({ data }: { data: NetflixValuation["intrinsicValueDistribution"] }) {
  const maxCount = Math.max(...data.counts, 1)
  const bars = data.counts.map((count, index) => ({
    count,
    label: `${data.binEdges[index].toFixed(0)}-${data.binEdges[index + 1].toFixed(0)}`,
  }))

  return (
    <div className="h-56">
      <div className="flex h-48 items-end gap-1 border-b border-l border-[#2A2A2A] px-2 pt-4">
        {bars.map((bar) => (
          <div key={bar.label} className="group relative flex flex-1 items-end">
            <div
              className="w-full rounded-t bg-[#86efac]/80 transition-colors group-hover:bg-[#86efac]"
              style={{ height: `${Math.max(3, (bar.count / maxCount) * 100)}%` }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 hidden -translate-x-1/2 rounded bg-[#1A1A1A] px-2 py-1 text-xs text-white group-hover:block">
              ${bar.label}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-[#777]">
        <span>Low</span>
        <span>Intrinsic value / share</span>
        <span>High</span>
      </div>
    </div>
  )
}

function SensitivitySurface({ surface }: { surface: NetflixValuation["sensitivitySurface"] }) {
  const flat = surface.values.flat()
  const min = Math.min(...flat)
  const max = Math.max(...flat)

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-xs">
        <thead>
          <tr>
            <th className="px-2 py-2 text-left font-medium text-[#919191]">TGR / WACC</th>
            {surface.wacc.map((wacc) => (
              <th key={wacc} className="px-2 py-2 text-right font-medium text-[#919191]">{percent(wacc)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {surface.terminalGrowth.map((growth, rowIndex) => (
            <tr key={growth}>
              <td className="px-2 py-2 text-[#919191]">{percent(growth)}</td>
              {surface.values[rowIndex].map((value, colIndex) => {
                const intensity = (value - min) / Math.max(max - min, 1)
                return (
                  <td
                    key={`${rowIndex}-${colIndex}`}
                    className="px-2 py-2 text-right font-medium text-white"
                    style={{
                      backgroundColor: `rgba(134, 239, 172, ${0.12 + intensity * 0.58})`,
                    }}
                  >
                    {formatCurrency(value)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ScenarioTree({ tree }: { tree: NetflixValuation["scenarioTree"] }) {
  const nodes = tree.nodes.map((node) => ({
    ...node,
    x: 50 + node.x * 42,
    y: 50 + node.y * 38,
  }))
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))

  return (
    <div className="relative h-[360px] overflow-hidden rounded-xl border border-[#1F1F1F] bg-[#101010]">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {tree.edges.map((edge) => {
          const source = nodeMap.get(edge.source)
          const target = nodeMap.get(edge.target)
          if (!source || !target) return null
          return (
            <line
              key={`${edge.source}-${edge.target}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke="#2A2A2A"
              strokeWidth="0.5"
            />
          )
        })}
      </svg>
      {nodes.map((node) => (
        <div
          key={node.id}
          className="absolute max-w-[150px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[#2A2A2A] bg-[#171717] px-3 py-2 text-center text-xs text-white shadow-xl"
          style={{ left: `${node.x}%`, top: `${node.y}%` }}
        >
          {node.id}
        </div>
      ))}
    </div>
  )
}

export function NetflixValuationResearch() {
  const [data, setData] = useState<NetflixValuation | null>(null)

  useEffect(() => {
    fetch(`${appBasePath}/data/netflix-valuation.json`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => setData(payload))
      .catch(() => setData(null))
  }, [])

  const contributionRows = useMemo(() => {
    if (!data) return []
    return [
      ...data.options.expansionOptions.map((option) => ({
        label: option.name,
        value: option.expectedValue,
        detail: `BS ${compactMoney(option.blackScholesValue)} x ${(option.probability * 100).toFixed(0)}%`,
      })),
      { label: "Abandonment flexibility", value: data.options.abandonmentOptionValueMM, detail: "Downside salvage/retreat payoff" },
      { label: "Delayed investment", value: data.options.delayedInvestmentOptionValueMM, detail: "Right to wait for signal" },
      { label: "Dynamic capital allocation", value: data.options.dynamicCapitalAllocationValueMM, detail: "Capital moves with observed growth" },
    ]
  }, [data])

  if (!data) {
    return (
      <section className="rounded-2xl bg-[#0D0D0D] p-6 text-sm text-[#919191]">
        Loading Netflix valuation model.
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-2xl bg-[#0D0D0D] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-[#86efac]">Real-options-enhanced valuation</p>
            <h2 className="mt-2 text-3xl font-semibold text-white">Netflix ({data.ticker})</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#919191]">
              Multi-stage DCF with subscriber growth, subscription price growth, retention, WACC variability, and strategic option overlays for AI, geography, product scaling, abandonment, delay, and capital allocation.
            </p>
          </div>
          <div className="rounded-lg bg-[#171717] px-3 py-2 text-sm text-[#919191]">
            {data.assumptions.trials.toLocaleString()} Monte Carlo trials
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Market price" value={formatCurrency(data.valuation.marketPrice)} detail="Current yfinance reference" />
          <Metric label="Traditional DCF median" value={formatCurrency(data.valuation.traditionalDcfPerShare["50"])} detail="Before real options" />
          <Metric label="Option-adjusted median" value={formatCurrency(data.valuation.optionAdjustedPerShare["50"])} detail="DCF plus strategic flexibility" />
          <Metric label="Option value / share" value={formatCurrency(data.valuation.meanOptionValuePerShare)} detail={compactMoney(data.valuation.optionValueTotalMM)} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <div className="rounded-2xl bg-[#0D0D0D] p-6">
          <div className="flex items-center gap-2 text-[#919191]">
            <LineChart className="h-5 w-5" />
            <span className="text-sm">Intrinsic value distribution</span>
          </div>
          <h3 className="mt-2 text-xl font-semibold text-white">Option-adjusted value / share</h3>
          <Histogram data={data.intrinsicValueDistribution} />
          <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs">
            {["5", "10", "25", "50", "75", "90", "95"].map((percentile) => (
              <div key={percentile} className="rounded-lg bg-[#171717] p-2">
                <div className="text-[#777]">P{percentile}</div>
                <div className="mt-1 font-medium text-white">{formatCurrency(data.valuation.optionAdjustedPerShare[percentile])}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-[#0D0D0D] p-6">
          <div className="flex items-center gap-2 text-[#919191]">
            <Sigma className="h-5 w-5" />
            <span className="text-sm">Core stochastic assumptions</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Metric label="WACC" value={percent(data.assumptions.wacc)} detail={`stdev ${percent(data.assumptions.waccStdev)}`} />
            <Metric label="Revenue growth stdev" value={percent(data.assumptions.revenueGrowthStdev)} detail="Log-growth history from workbook" />
            <Metric label="Annualized retention" value={percent(data.assumptions.retentionRate)} detail={`monthly churn ${percent(data.assumptions.monthlyChurn)}`} />
            <Metric label="Terminal growth" value={percent(data.assumptions.terminalGrowthUsed)} detail="Bounded below WACC" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-[#0D0D0D] p-6">
        <div className="flex items-center gap-2 text-[#919191]">
          <Table2 className="h-5 w-5" />
          <span className="text-sm">DCF forecast drivers</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-[#919191]">
              <tr>
                {["Year", "Subscriber growth", "Price growth", "Retention", "Revenue growth", "Revenue", "NOPAT margin", "FCF"].map((header) => (
                  <th key={header} className="border-b border-[#1F1F1F] px-3 py-3 text-right font-medium first:text-left">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F1F1F]">
              {data.forecast.map((row) => (
                <tr key={row.year}>
                  <td className="px-3 py-3 font-medium text-white">{row.year}</td>
                  <td className="px-3 py-3 text-right text-white">{percent(row.subscriberGrowth)}</td>
                  <td className="px-3 py-3 text-right text-white">{percent(row.priceGrowth)}</td>
                  <td className="px-3 py-3 text-right text-white">{percent(row.retentionRate)}</td>
                  <td className="px-3 py-3 text-right text-white">{percent(row.baseRevenueGrowth)}</td>
                  <td className="px-3 py-3 text-right text-white">{compactMoney(row.baseRevenue)}</td>
                  <td className="px-3 py-3 text-right text-white">{percent(row.nopatMargin)}</td>
                  <td className="px-3 py-3 text-right text-white">{compactMoney(row.freeCashFlow)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl bg-[#0D0D0D] p-6">
          <div className="flex items-center gap-2 text-[#919191]">
            <GitBranch className="h-5 w-5" />
            <span className="text-sm">Sensitivity surface</span>
          </div>
          <h3 className="mt-2 text-xl font-semibold text-white">Option-adjusted value by WACC and terminal growth</h3>
          <div className="mt-4">
            <SensitivitySurface surface={data.sensitivitySurface} />
          </div>
        </div>

        <div className="rounded-2xl bg-[#0D0D0D] p-6">
          <div className="flex items-center gap-2 text-[#919191]">
            <Network className="h-5 w-5" />
            <span className="text-sm">Scenario tree</span>
          </div>
          <h3 className="mt-2 text-xl font-semibold text-white">Management flexibility paths</h3>
          <div className="mt-4">
            <ScenarioTree tree={data.scenarioTree} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-[#0D0D0D] p-6">
        <h3 className="text-xl font-semibold text-white">Expected strategic value contribution</h3>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {contributionRows.map((row) => (
            <div key={row.label} className="rounded-xl border border-[#1F1F1F] bg-[#101010] p-4">
              <div className="text-sm font-medium text-white">{row.label}</div>
              <div className="mt-2 text-2xl font-semibold text-[#86efac]">{compactMoney(row.value)}</div>
              <div className="mt-1 text-xs text-[#919191]">{row.detail}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-2 text-sm text-[#919191]">
          {data.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      </div>
    </section>
  )
}
