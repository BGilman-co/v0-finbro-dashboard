import { NextResponse } from "next/server"
import { z } from "zod"

import { createSupabaseServerClient, isSupabasePublicConfigured } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"
export const revalidate = 0

const signupSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6).max(128),
})

export async function POST(request: Request) {
  const parsed = signupSchema.safeParse(await request.json().catch(() => ({})))

  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email and a password with at least 6 characters." }, { status: 400 })
  }

  if (!isSupabasePublicConfigured()) {
    return NextResponse.json({ error: "Supabase signup is not configured on the server." }, { status: 500 })
  }

  const supabaseServer = createSupabaseServerClient()
  const email = parsed.data.email.toLowerCase()
  const origin = new URL(request.url).origin
  const emailRedirectTo = `${origin}/auth/callback`

  const { data, error } = await supabaseServer.auth.signUp({
    email,
    password: parsed.data.password,
    options: {
      emailRedirectTo,
    },
  })

  if (error) {
    if (error.message.toLowerCase().includes("already")) {
      const { error: resendExistingError } = await supabaseServer.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo,
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

  const verificationEmailSent = Boolean(data.user && !data.session)

  if (!verificationEmailSent) {
    return NextResponse.json(
      {
        email,
        requiresEmailVerification: true,
        verificationEmailSent: false,
        warning: "Supabase did not confirm that it sent the verification email. Check the project email provider settings.",
      },
      { status: 202 },
    )
  }

  return NextResponse.json({ email, requiresEmailVerification: true, verificationEmailSent: true }, { status: 201 })
}
