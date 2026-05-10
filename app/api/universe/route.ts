import { NextResponse } from "next/server"
import { getSp500Universe } from "@/lib/market-data"

export async function GET() {
  const securities = await getSp500Universe()

  return NextResponse.json(
    {
      securities,
      count: securities.length,
      provider: securities.length > 400 ? "Wikipedia S&P 500 constituents" : "Local fallback",
      updatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  )
}
