import { NextResponse } from "next/server"
import { getPriceHistoryPayload } from "@/lib/market-data"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get("symbol") ?? "AAPL"
  const payload = await getPriceHistoryPayload(symbol)

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  })
}
