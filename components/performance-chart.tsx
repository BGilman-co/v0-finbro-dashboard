"use client"

import { Calendar, Download } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts"
import { type Holding, type Period, formatCurrency, getSeries } from "@/lib/portfolio-data"

type PerformanceChartProps = {
  holding: Holding
  period: Period
  onPeriodChange: (period: Period) => void
}

const periods: Period[] = ["1D", "1M", "3M", "6M", "1Y"]

export function PerformanceChart({ holding, period, onPeriodChange }: PerformanceChartProps) {
  const data = getSeries(holding, period)
  const prices = data.map((point) => point.price)
  const low = Math.min(...prices)
  const high = Math.max(...prices)
  const padding = Math.max((high - low) * 0.2, high * 0.03)
  const latestPrice = data.at(-1)?.price ?? 0

  const downloadCsv = () => {
    const rows = [
      ["symbol", "period", "date", "label", "price"],
      ...data.map((point) => [holding.id, period, point.date, point.label, point.price.toString()]),
    ]
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a")

    link.href = url
    link.download = `${holding.id}-${period}-performance.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-6 p-6 bg-[#0D0D0D] rounded-2xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 md:gap-2 lg:gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-medium text-white">Performance</h2>
          <div className="flex items-center gap-2 px-3 py-1 bg-[#1A1A1A] rounded-full border border-[#333]">
            <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: holding.color }}>
              <span className="text-[10px] font-bold text-white">{holding.id.charAt(0)}</span>
            </div>
            <span className="text-sm font-medium text-white">{holding.id}</span>
          </div>
          <span className="text-sm text-[#919191]">{formatCurrency(latestPrice)}</span>
        </div>

        <div className="flex items-center gap-4 md:gap-2 lg:gap-4">
          <div className="flex items-center bg-[#1A1A1A] rounded-lg p-1">
            {periods.map((periodOption) => (
              <button
                key={periodOption}
                onClick={() => onPeriodChange(periodOption)}
                className={`px-3 md:px-2 lg:px-3 py-1 text-sm md:text-xs lg:text-sm rounded-md transition-colors ${
                  periodOption === period
                    ? 'bg-[#2A2A2A] text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {periodOption}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              className="p-2 text-gray-400 hover:text-white bg-[#1A1A1A] rounded-lg transition-colors"
              title="Show latest available date"
              onClick={() => window.alert(`Latest sample date: ${data.at(-1)?.label ?? "Unavailable"}`)}
            >
              <Calendar className="h-5 w-5" />
            </button>
            <button
              className="p-2 text-gray-400 hover:text-white bg-[#1A1A1A] rounded-lg transition-colors"
              title="Download chart data"
              onClick={downloadCsv}
            >
              <Download className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="h-[400px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#86efac" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#86efac" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1F1F1F" vertical={false} />
            <XAxis
              dataKey="label"
              hide
            />
            <YAxis
              domain={[Math.max(0, low - padding), high + padding]}
              orientation="left"
              tick={{ fill: '#666' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-[#1A1A1A] border border-[#333] p-2 rounded-lg shadow-xl">
                      <p className="text-white font-medium">
                        {Number(payload[0].value).toFixed(2)} USD <span className="text-gray-400 text-sm ml-2">{payload[0].payload.label}</span>
                      </p>
                    </div>
                  )
                }
                return null
              }}
            />

            <Area
              type="monotone"
              dataKey="price"
              stroke="#86efac"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorPrice)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
