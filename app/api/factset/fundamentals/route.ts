import { NextResponse } from "next/server"

import { fetchWrdsFactsetRows, wrdsFactsetRequestSchema } from "@/lib/wrds-client"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = wrdsFactsetRequestSchema.safeParse({
    table: "factset.ff_basic_af_am",
    limit: url.searchParams.get("limit") ?? "10",
    offset: url.searchParams.get("offset") ?? "0",
    filters: {
      ...(url.searchParams.get("fsym_id") ? { fsym_id: url.searchParams.get("fsym_id") ?? "" } : {}),
      ...(url.searchParams.get("date") ? { date: url.searchParams.get("date") ?? "" } : {}),
    },
  })

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid WRDS fundamentals request." }, { status: 400 })
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
  const body = await request.json().catch(() => ({}))
  const parsed = wrdsFactsetRequestSchema.safeParse({
    table: "factset.ff_basic_af_am",
    limit: body.limit,
    offset: body.offset,
    filters: body.filters ?? (body.fsym_id ? { fsym_id: body.fsym_id } : {}),
  })

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid WRDS fundamentals request." }, { status: 400 })
  }

  const payload = await fetchWrdsFactsetRows(parsed.data)

  return NextResponse.json(payload, {
    status: payload.ok ? 200 : payload.isConfigured ? 502 : 501,
    headers: {
      "Cache-Control": "no-store",
    },
  })
}
