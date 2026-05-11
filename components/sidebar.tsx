"use client"

import type { ComponentType } from "react"
import { Blocks, BarChart3, Search, Container, Banknote, SquareArrowOutUpRight, Settings2, LogOut } from 'lucide-react'

export type NavItem = "dashboard" | "analytics" | "arbitrader" | "researcher" | "funds"

type SidebarProps = {
  activeItem: NavItem
  onNavigate: (item: NavItem) => void
  onSupport: () => void
}

const items: Array<{ id: NavItem; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: "dashboard", label: "DATABASE", icon: Blocks },
  { id: "analytics", label: "ANALYTICS", icon: BarChart3 },
  { id: "arbitrader", label: "SCREENER", icon: Search },
  { id: "researcher", label: "RESEARCHER", icon: Container },
  { id: "funds", label: "DATASETS", icon: Banknote },
]

export function Sidebar({ activeItem, onNavigate, onSupport }: SidebarProps) {
  return (
    <aside className="sticky top-24 h-[calc(100vh-8rem)] md:w-48 lg:w-64 bg-[#0D0D0D] rounded-2xl hidden md:flex flex-col p-8 overflow-y-auto">
      <nav className="flex flex-col gap-8">
        {items.map((item) => {
          const Icon = item.icon
          const active = activeItem === item.id

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex items-center gap-4 text-left transition-colors ${active ? "text-[#E7E7E7]" : "text-[#919191] hover:text-[#E7E7E7]"}`}
            >
              <Icon className="h-6 w-6" />
              <span className="text-sm font-medium tracking-wide">{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="mt-auto pt-8 border-t border-[#1F1F1F] flex flex-col gap-8">
        <button onClick={onSupport} className="flex items-center gap-4 text-left text-[#919191] hover:text-[#E7E7E7] transition-colors">
          <SquareArrowOutUpRight className="h-6 w-6" />
          <span className="text-sm font-medium tracking-wide">DATA SOURCE REQUEST</span>
        </button>
        <button onClick={() => window.alert("Source settings need a connected data provider first.")} className="flex items-center gap-4 text-left text-[#919191] hover:text-[#E7E7E7] transition-colors">
          <Settings2 className="h-6 w-6" />
          <span className="text-sm font-medium tracking-wide">SOURCES</span>
        </button>
        <button onClick={() => window.alert("Export tools need a connected data provider first.")} className="flex items-center gap-4 text-left text-[#919191] hover:text-[#E7E7E7] transition-colors">
          <LogOut className="h-6 w-6" />
          <span className="text-sm font-medium tracking-wide">EXPORTS</span>
        </button>
      </div>
    </aside>
  )
}
