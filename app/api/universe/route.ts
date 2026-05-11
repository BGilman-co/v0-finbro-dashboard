import { NextResponse } from "next/server"

import { loadSp500Universe } from "@/lib/server-market-data"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  const payload = await loadSp500Universe()

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  })
}
