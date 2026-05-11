import { NextResponse } from "next/server"

import { fetchWrdsFactsetEndpoints } from "@/lib/wrds-client"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  const payload = await fetchWrdsFactsetEndpoints()

  return NextResponse.json(payload, {
    status: payload.ok ? 200 : payload.isConfigured ? 502 : 501,
    headers: {
      "Cache-Control": "no-store",
    },
  })
}
