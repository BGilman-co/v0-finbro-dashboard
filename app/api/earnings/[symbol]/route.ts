import { NextResponse } from "next/server"
import { z } from "zod"

import { loadFinnhubEarnings } from "@/lib/finnhub-data"

export const dynamic = "force-dynamic"
export const revalidate = 0

const paramsSchema = z.object({
  symbol: z.string().min(1).max(16),
})

export async function GET(_request: Request, context: { params: Promise<{ symbol: string }> }) {
  const parsed = paramsSchema.safeParse(await context.params)

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid ticker symbol." }, { status: 400 })
  }

  const payload = await loadFinnhubEarnings(parsed.data.symbol)

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "s-maxage=900, stale-while-revalidate=3600",
    },
  })
}
