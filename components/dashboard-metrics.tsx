"use client"

import { Database } from 'lucide-react'

type DashboardMetricsProps = {
  stats: {
    symbols: number
    records: number
    sectors: number
    datasets: number
  }
}

export function DashboardMetrics({ stats }: DashboardMetricsProps) {
  return (
    <div className="flex flex-col xl:flex-row gap-8 xl:items-center justify-between p-6 bg-[#0D0D0D] rounded-2xl">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-gray-400">
          <Database className="h-5 w-5" />
          <span className="text-lg">Financial Data Library</span>
        </div>
        <div className="text-5xl md:text-4xl lg:text-5xl font-bold text-white">{stats.symbols}</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 xl:gap-16">
        <div className="flex flex-col gap-1">
          <span className="text-gray-400 text-sm">Tracked Symbols</span>
          <span className="text-2xl md:text-xl lg:text-2xl font-semibold text-white">{stats.symbols}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-gray-400 text-sm">Price Records</span>
          <span className="text-2xl md:text-xl lg:text-2xl font-semibold text-[#86efac]">{stats.records.toLocaleString()}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-gray-400 text-sm">Sectors</span>
          <span className="text-2xl md:text-xl lg:text-2xl font-semibold text-white">{stats.sectors}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-gray-400 text-sm">Datasets</span>
          <span className="text-2xl md:text-xl lg:text-2xl font-semibold text-white">{stats.datasets}</span>
        </div>
      </div>
    </div>
  )
}
