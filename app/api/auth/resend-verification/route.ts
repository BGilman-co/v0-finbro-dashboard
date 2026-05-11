import { NextResponse } from "next/server"
import { z } from "zod"

import { createSupabaseAdminClient, getSupabaseAdminConfigError, isSupabaseAdminConfigured } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"
export const revalidate = 0

const resendVerificationSchema = z.object({
  email: z.string().trim().email(),
})

export async function POST(request: Request) {
  const parsed = resendVerificationSchema.safeParse(await request.json().catch(() => ({})))

  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: getSupabaseAdminConfigError() ?? "Supabase email verification is not configured." },
      { status: 500 },
    )
  }

  const origin = new URL(request.url).origin
  const emailRedirectTo = `${origin}/auth/callback`
  const supabaseAdmin = createSupabaseAdminClient()
  const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(parsed.data.email.toLowerCase(), {
    redirectTo: emailRedirectTo,
    data: { email: parsed.data.email.toLowerCase() },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status ?? 400 })
  }

  return NextResponse.json({ ok: true })
}
