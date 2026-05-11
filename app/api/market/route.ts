import { NextResponse } from "next/server"
import { z } from "zod"

import { loadMarketData } from "@/lib/server-market-data"

export const dynamic = "force-dynamic"
export const revalidate = 0

const marketRequestSchema = z.object({
  symbols: z.array(z.string()).max(600).default([]),
  optionSymbol: z.string().default("AAPL"),
})

export async function POST(request: Request) {
  const parsed = marketRequestSchema.safeParse(await request.json().catch(() => ({})))

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid market data request." }, { status: 400 })
  }

  const payload = await loadMarketData(parsed.data.symbols, parsed.data.optionSymbol)

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  })
}
