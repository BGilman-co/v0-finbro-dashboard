import { NextResponse } from "next/server"
import { z } from "zod"

import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
  getSupabaseAdminConfigError,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"
export const revalidate = 0

const signupSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(4).max(128),
})

export async function POST(request: Request) {
  const parsed = signupSchema.safeParse(await request.json().catch(() => ({})))

  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email and a password with at least 4 characters." }, { status: 400 })
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: getSupabaseAdminConfigError() ?? "Supabase signup is not configured on the server." },
      { status: 500 },
    )
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const supabaseServer = createSupabaseServerClient()
  const email = parsed.data.email.toLowerCase()
  const origin = new URL(request.url).origin
  const emailRedirectTo = `${origin}/auth/callback`

  const { error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: parsed.data.password,
    email_confirm: false,
    user_metadata: { email },
  })

  if (error) {
    if (error.message.toLowerCase().includes("already")) {
      const { error: resendExistingError } = await supabaseServer.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo,
          shouldCreateUser: false,
        },
      })

      if (resendExistingError) {
        return NextResponse.json(
          {
            email,
            requiresEmailVerification: true,
            verificationEmailSent: false,
            warning: resendExistingError.message,
          },
          { status: 202 },
        )
      }

      return NextResponse.json({ email, requiresEmailVerification: true, verificationEmailSent: true }, { status: 202 })
    }

    return NextResponse.json({ error: error.message }, { status: error.status ?? 400 })
  }

  const { error: resendError } = await supabaseServer.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
      shouldCreateUser: false,
    },
  })

  if (resendError) {
    return NextResponse.json(
      {
        email,
        requiresEmailVerification: true,
        verificationEmailSent: false,
        warning: resendError.message,
      },
      { status: 202 },
    )
  }

  return NextResponse.json({ email, requiresEmailVerification: true, verificationEmailSent: true }, { status: 201 })
}
