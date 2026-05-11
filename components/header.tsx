"use client"

import { BrandLogo } from "@/components/brand-logo"
import { LogOut, Settings2, UserCircle } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type HeaderProps = {
  onSettings: () => void
  onLogout: () => void
}

export function Header({ onSettings, onLogout }: HeaderProps) {
  return (
    <header className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-6 bg-black/10 backdrop-blur-[120px]">
      <BrandLogo className="text-white h-8 w-auto" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-lg bg-[#1A1A1A] px-3 py-2 text-sm text-[#E7E7E7] transition-colors hover:bg-[#242424] focus:outline-none focus:ring-2 focus:ring-white/20">
            <UserCircle className="h-4 w-4" />
            Account
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 bg-[#0D0D0D] border-[#1F1F1F] text-white">
          <DropdownMenuItem onClick={onSettings} className="focus:bg-[#1F1F1F] focus:text-white cursor-pointer text-[#919191]">
            <Settings2 className="mr-2 h-4 w-4 text-[#919191]" />
            <span>Settings</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onLogout} className="focus:bg-[#1F1F1F] focus:text-white cursor-pointer text-[#919191]">
            <LogOut className="mr-2 h-4 w-4 text-[#919191]" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
