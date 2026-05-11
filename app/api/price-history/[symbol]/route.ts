import { NextResponse } from "next/server"
import { z } from "zod"

import { loadPriceHistory } from "@/lib/server-market-data"

export const dynamic = "force-dynamic"
export const revalidate = 0

const paramsSchema = z.object({
  symbol: z.string().min(1).max(16),
})

const searchParamsSchema = z.object({
  range: z.enum(["1w", "1m", "ytd", "1y", "5y", "10y", "all"]).default("1y"),
})

export async function GET(request: Request, context: { params: Promise<{ symbol: string }> }) {
  const parsed = paramsSchema.safeParse(await context.params)
  const searchParsed = searchParamsSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))

  if (!parsed.success || !searchParsed.success) {
    return NextResponse.json({ error: "Invalid ticker symbol." }, { status: 400 })
  }

  const payload = await loadPriceHistory(parsed.data.symbol, searchParsed.data.range)

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  })
}
