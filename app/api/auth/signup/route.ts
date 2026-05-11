import { NextResponse } from "next/server"
import { z } from "zod"

import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase-admin"

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
    return NextResponse.json({ error: "Supabase signup is not configured on the server." }, { status: 500 })
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const email = parsed.data.email.toLowerCase()

  const { error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { email },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status ?? 400 })
  }

  return NextResponse.json({ email }, { status: 201 })
}
