import { NextResponse } from "next/server"

import { factsetFundamentalsRequestSchema, fetchFactsetFundamentals } from "@/lib/factset-client"

export const dynamic = "force-dynamic"
export const revalidate = 0

function arrayParam(value: string | null) {
  return value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = factsetFundamentalsRequestSchema.safeParse({
    ids: arrayParam(url.searchParams.get("ids")),
    metrics: arrayParam(url.searchParams.get("metrics")),
    periodicity: url.searchParams.get("periodicity") ?? undefined,
    fiscalPeriodStart: url.searchParams.get("fiscalPeriodStart") ?? undefined,
    fiscalPeriodEnd: url.searchParams.get("fiscalPeriodEnd") ?? undefined,
    currency: url.searchParams.get("currency") ?? undefined,
    updateType: url.searchParams.get("updateType") ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid FactSet fundamentals request." }, { status: 400 })
  }

  const payload = await fetchFactsetFundamentals(parsed.data)

  return NextResponse.json(payload, {
    status: payload.ok ? 200 : payload.isConfigured ? 502 : 501,
    headers: {
      "Cache-Control": "no-store",
    },
  })
}

export async function POST(request: Request) {
  const parsed = factsetFundamentalsRequestSchema.safeParse(await request.json().catch(() => ({})))

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid FactSet fundamentals request." }, { status: 400 })
  }

  const payload = await fetchFactsetFundamentals(parsed.data)

  return NextResponse.json(payload, {
    status: payload.ok ? 200 : payload.isConfigured ? 502 : 501,
    headers: {
      "Cache-Control": "no-store",
    },
  })
}
