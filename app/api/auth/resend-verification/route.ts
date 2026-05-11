import { NextResponse } from "next/server"
import { z } from "zod"

import { createSupabaseServerClient, isSupabasePublicConfigured } from "@/lib/supabase-admin"

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

  if (!isSupabasePublicConfigured()) {
    return NextResponse.json({ error: "Supabase email verification is not configured." }, { status: 500 })
  }

  const origin = new URL(request.url).origin
  const emailRedirectTo = `${origin}/auth/callback`
  const supabaseServer = createSupabaseServerClient()
  const { error } = await supabaseServer.auth.resend({
    type: "signup",
    email: parsed.data.email.toLowerCase(),
    options: {
      emailRedirectTo,
    },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status ?? 400 })
  }

  return NextResponse.json({ ok: true })
}
