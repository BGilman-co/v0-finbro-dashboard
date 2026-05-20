import { NextResponse } from "next/server"

import { loadFinnhubEarningsMonitor } from "@/lib/finnhub-data"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authorization = request.headers.get("authorization")

  if (cronSecret && authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const payload = await loadFinnhubEarningsMonitor()

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  })
}
