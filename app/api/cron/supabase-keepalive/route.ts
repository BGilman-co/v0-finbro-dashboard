import { NextResponse } from "next/server"

import { createSupabaseAdminClient, getSupabaseAdminConfigError, isSupabaseAdminConfigured } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"
export const revalidate = 0

type SupabaseKeepaliveRow = {
  check_count: number
  check_name: string
  checked_at: string
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authorization = request.headers.get("authorization")

  if (cronSecret && authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      {
        error: "Supabase admin environment variables are not configured.",
        detail: getSupabaseAdminConfigError(),
      },
      { status: 500 },
    )
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .rpc("record_service_health_check", { target_check_name: "supabase_keepalive" })
    .returns<SupabaseKeepaliveRow[]>()

  if (error) {
    return NextResponse.json(
      {
        error: "Supabase keepalive failed.",
        detail: error.message,
      },
      { status: 500 },
    )
  }

  const healthChecks = Array.isArray(data) ? (data as SupabaseKeepaliveRow[]) : []
  const healthCheck = healthChecks[0] ?? null

  return NextResponse.json(
    {
      ok: true,
      checkName: healthCheck?.check_name ?? "supabase_keepalive",
      checkedAt: healthCheck?.checked_at ?? new Date().toISOString(),
      checkCount: healthCheck?.check_count ?? null,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  )
}
