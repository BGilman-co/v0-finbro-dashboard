import { NextResponse } from "next/server"
import { holdings } from "@/lib/portfolio-data"
import { getMarketPayload } from "@/lib/market-data"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbols =
    searchParams
      .get("symbols")
      ?.split(",")
      .map((symbol) => symbol.trim())
      .filter(Boolean) ?? holdings.map((holding) => holding.id)
  const optionSymbol = searchParams.get("optionSymbol") ?? symbols[0]
  const payload = await getMarketPayload(symbols, optionSymbol)

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  })
}
