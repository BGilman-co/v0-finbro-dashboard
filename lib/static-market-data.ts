"use client"

import type { FilingsPayload, MarketPayload, PriceHistoryPayload, UniversePayload } from "@/lib/market-types"

const appBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

export type { UniversePayload }

export type WrdsFactsetPayload = {
  provider: string
  ok: boolean
  isConfigured: boolean
  table: string
  count: number
  next?: string | null
  previous?: string | null
  results: Array<Record<string, unknown>>
  message: string
  updatedAt: string
}

export type WrdsFactsetEndpointsPayload = {
  provider: string
  ok: boolean
  isConfigured: boolean
  endpoints: string[]
  message: string
  updatedAt: string
}

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

export async function loadWrdsFactsetRows(input: {
  table: string
  limit?: number
  offset?: number
  filters?: Record<string, string>
}): Promise<WrdsFactsetPayload> {
  return fetchJson<WrdsFactsetPayload>("/api/wrds/factset", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function loadWrdsFactsetEndpoints(): Promise<WrdsFactsetEndpointsPayload> {
  return fetchJson<WrdsFactsetEndpointsPayload>("/api/wrds/factset/endpoints")
}
