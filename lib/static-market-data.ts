"use client"

import type { FilingsPayload, MarketPayload, PriceHistoryPayload, UniversePayload } from "@/lib/market-types"

const appBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

export type { UniversePayload }

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${appBasePath}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

export async function loadSp500Universe(): Promise<UniversePayload> {
  return fetchJson<UniversePayload>("/api/universe")
}

export async function loadMarketData(symbols: string[], optionSymbol: string): Promise<MarketPayload> {
  return fetchJson<MarketPayload>("/api/market", {
    method: "POST",
    body: JSON.stringify({ symbols, optionSymbol }),
  })
}

export async function loadPriceHistory(symbol: string): Promise<PriceHistoryPayload> {
  return fetchJson<PriceHistoryPayload>(`/api/price-history/${encodeURIComponent(symbol)}`)
}

export async function loadFilings(symbol: string): Promise<FilingsPayload> {
  return fetchJson<FilingsPayload>(`/api/filings/${encodeURIComponent(symbol)}`)
}
