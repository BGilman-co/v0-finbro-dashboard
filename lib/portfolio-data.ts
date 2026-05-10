export type Period = "1D" | "1M" | "3M" | "6M" | "1Y"

export type PricePoint = {
  date: string
  label: string
  price: number
}

export type Holding = {
  id: string
  name: string
  qty: number
  averageCost: number
  color: string
  history: PricePoint[]
}

const baseDate = new Date("2026-05-09T16:00:00")

const dayMs = 24 * 60 * 60 * 1000

function formatDay(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function buildHistory(
  startPrice: number,
  drift: number,
  volatility: number,
  phase: number,
): PricePoint[] {
  return Array.from({ length: 366 }, (_, index) => {
    const date = new Date(baseDate.getTime() - (365 - index) * dayMs)
    const trend = startPrice + index * drift
    const wave = Math.sin(index / 11 + phase) * volatility
    const shorterWave = Math.cos(index / 5 + phase) * (volatility / 2)
    const price = Math.max(1, trend + wave + shorterWave)

    return {
      date: date.toISOString().slice(0, 10),
      label: formatDay(date),
      price: Number(price.toFixed(2)),
    }
  })
}

function buildIntraday(latestPrice: number, phase: number): PricePoint[] {
  return Array.from({ length: 24 }, (_, index) => {
    const hour = 9 + Math.floor(index / 2)
    const minutes = index % 2 === 0 ? "30" : "00"
    const price =
      latestPrice +
      Math.sin(index / 2 + phase) * (latestPrice * 0.006) +
      Math.cos(index / 3 + phase) * (latestPrice * 0.003)

    return {
      date: `2026-05-09T${String(hour).padStart(2, "0")}:${minutes}:00`,
      label: `${hour > 12 ? hour - 12 : hour}:${minutes}`,
      price: Number(price.toFixed(2)),
    }
  })
}

export const holdings: Holding[] = [
  {
    id: "TSLA",
    name: "Tesla",
    qty: 29,
    averageCost: 318.4,
    color: "#ef4444",
    history: buildHistory(235, 0.42, 21, 0.4),
  },
  {
    id: "AMD",
    name: "Advanced Micro Devices",
    qty: 14,
    averageCost: 154.25,
    color: "#f97316",
    history: buildHistory(184, -0.09, 13, 1.8),
  },
  {
    id: "NVDA",
    name: "Nvidia",
    qty: 18,
    averageCost: 92.6,
    color: "#22c55e",
    history: buildHistory(96, 0.18, 8, 3.2),
  },
  {
    id: "AAPL",
    name: "Apple",
    qty: 11,
    averageCost: 189.1,
    color: "#60a5fa",
    history: buildHistory(171, 0.08, 6, 2.5),
  },
]

export function getSeries(holding: Holding, period: Period): PricePoint[] {
  if (period === "1D") {
    return buildIntraday(getLatestPrice(holding), holding.id.length)
  }

  const daysByPeriod: Record<Exclude<Period, "1D">, number> = {
    "1M": 30,
    "3M": 90,
    "6M": 180,
    "1Y": 365,
  }

  return holding.history.slice(-daysByPeriod[period])
}

export function getLatestPrice(holding: Holding) {
  return holding.history.at(-1)?.price ?? 0
}

export function getPreviousClose(holding: Holding) {
  return holding.history.at(-2)?.price ?? getLatestPrice(holding)
}

export function getHoldingStats(holding: Holding) {
  const latest = getLatestPrice(holding)
  const previousClose = getPreviousClose(holding)
  const invested = holding.qty * holding.averageCost
  const current = holding.qty * latest
  const returns = current - invested
  const oneDayReturns = holding.qty * (latest - previousClose)

  return {
    latest,
    invested,
    current,
    returns,
    returnsPercent: invested === 0 ? 0 : (returns / invested) * 100,
    oneDayReturns,
    oneDayPercent: previousClose === 0 ? 0 : ((latest - previousClose) / previousClose) * 100,
  }
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value)
}

export function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`
}
