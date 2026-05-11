import { NextResponse } from "next/server"

import { fetchWrdsFactsetRows, wrdsFactsetRequestSchema } from "@/lib/wrds-client"

export const dynamic = "force-dynamic"
export const revalidate = 0

function parseRequestUrl(request: Request) {
  const url = new URL(request.url)
  const filters: Record<string, string> = {}
  const reserved = new Set(["table", "limit", "offset"])

  for (const [key, value] of url.searchParams.entries()) {
    if (!reserved.has(key)) {
      filters[key] = value
    }
  }

  return {
    table: url.searchParams.get("table") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
    filters,
  }
}

export async function GET(request: Request) {
  const parsed = wrdsFactsetRequestSchema.safeParse(parseRequestUrl(request))

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid WRDS FactSet request." }, { status: 400 })
  }

  const payload = await fetchWrdsFactsetRows(parsed.data)

  return NextResponse.json(payload, {
    status: payload.ok ? 200 : payload.isConfigured ? 502 : 501,
    headers: {
      "Cache-Control": "no-store",
    },
  })
}

export async function POST(request: Request) {
  const parsed = wrdsFactsetRequestSchema.safeParse(await request.json().catch(() => ({})))

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid WRDS FactSet request." }, { status: 400 })
  }

  const payload = await fetchWrdsFactsetRows(parsed.data)

  return NextResponse.json(payload, {
    status: payload.ok ? 200 : payload.isConfigured ? 502 : 501,
    headers: {
      "Cache-Control": "no-store",
    },
  })
}
