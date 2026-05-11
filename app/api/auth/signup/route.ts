import { NextResponse } from "next/server"
import { z } from "zod"

import {
  createSupabaseAdminClient,
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
  const email = parsed.data.email.toLowerCase()
  const origin = new URL(request.url).origin
  const emailRedirectTo = `${origin}/auth/callback`

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: emailRedirectTo,
    data: { email },
  })

  if (!error && data.user) {
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
      password: parsed.data.password,
      user_metadata: { email },
    })

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: updateError.status ?? 400 })
    }

    return NextResponse.json({ email, requiresEmailVerification: true, verificationEmailSent: true }, { status: 201 })
  }

  if (error && error.message.toLowerCase().includes("already")) {
    const { data: reinviteData, error: reinviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: emailRedirectTo,
      data: { email },
    })

    if (reinviteError) {
      return NextResponse.json(
        {
          email,
          requiresEmailVerification: true,
          verificationEmailSent: false,
          warning: reinviteError.message,
        },
        { status: reinviteError.status ?? 202 },
      )
    }

    if (reinviteData.user) {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(reinviteData.user.id, {
        password: parsed.data.password,
        user_metadata: { email },
      })

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: updateError.status ?? 400 })
      }
    }

    return NextResponse.json({ email, requiresEmailVerification: true, verificationEmailSent: true }, { status: 202 })
  }

  if (error) {
    return NextResponse.json(
      {
        email,
        requiresEmailVerification: true,
        verificationEmailSent: false,
        warning: error.message,
      },
      { status: error.status ?? 202 },
    )
  }

  const { error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: parsed.data.password,
    email_confirm: false,
    user_metadata: { email },
  })

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: createError.status ?? 400 })
  }

  return NextResponse.json(
    {
      email,
      requiresEmailVerification: true,
      verificationEmailSent: false,
      warning: "Account created, but Supabase did not send an invite email.",
    },
    { status: 202 },
  )
}
