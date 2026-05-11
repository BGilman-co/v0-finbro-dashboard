import { NextResponse } from "next/server"
import { z } from "zod"

import { loadFilings } from "@/lib/server-market-data"

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

  const payload = await loadFilings(parsed.data.symbol)

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  })
}
