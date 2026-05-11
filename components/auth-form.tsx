"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import type { FormEvent } from "react"
import { useState } from "react"
import { LockKeyhole, LogIn, MailCheck, Send, UserPlus } from "lucide-react"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-client"

type AuthFormProps = {
  mode: "login" | "signup"
}

const authSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(4, "Password must be at least 4 characters."),
})

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [needsVerification, setNeedsVerification] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const isSignup = mode === "signup"

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setNeedsVerification(false)

    const parsed = authSchema.safeParse({ email, password })

    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "Check your login details.")
      return
    }

    if (!isSupabaseConfigured()) {
      setMessage("Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to connect Supabase.")
      return
    }

    setIsSubmitting(true)

    const normalizedEmail = parsed.data.email.trim().toLowerCase()
    const supabase = getSupabaseBrowserClient()

    if (isSignup) {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: normalizedEmail,
          password: parsed.data.password,
        }),
      })

      const body = (await response.json().catch(() => null)) as {
        error?: string
        verificationEmailSent?: boolean
        warning?: string
      } | null

      if (!response.ok) {
        setIsSubmitting(false)
        setMessage(body?.error ?? "Unable to create account.")
        return
      }

      setIsSubmitting(false)
      setPassword("")
      setNeedsVerification(true)
      setMessage(
        body?.verificationEmailSent
          ? "Verification email sent. Open it to verify your account, then log in."
          : `Account created, but the verification email was not sent yet: ${body?.warning ?? "try sending it again."}`,
      )
      return
    }

    const authResponse = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: parsed.data.password,
    })

    setIsSubmitting(false)

    if (authResponse.error) {
      const errorMessage = authResponse.error.message.toLowerCase()
      const message = errorMessage.includes("invalid api key")
        ? "Supabase auth is misconfigured for this environment. Make sure the public Supabase URL and anon key belong to the same project."
        : errorMessage.includes("email not confirmed")
          ? "Check your email and verify your address before logging in."
          : "No matching verified account was found. Sign up first, or check your email and password."

      setNeedsVerification(errorMessage.includes("email not confirmed"))
      setMessage(message)
      return
    }

    router.replace("/")
    router.refresh()
  }

  async function handleResendVerification() {
    const parsed = z.string().trim().email("Enter a valid email address.").safeParse(email)

    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "Enter a valid email address.")
      return
    }

    setIsResending(true)
    setMessage(null)

    const response = await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: parsed.data.trim().toLowerCase(),
      }),
    })
    const body = (await response.json().catch(() => null)) as { error?: string } | null

    setIsResending(false)

    if (!response.ok) {
      setNeedsVerification(true)
      setMessage(body?.error ?? "Unable to send verification email. Try again shortly.")
      return
    }

    setNeedsVerification(true)
    setMessage("Verification email sent. Open it to verify your account, then log in.")
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 py-10 text-white">
      <section className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0D0D0D] p-6 shadow-2xl shadow-black/40">
        <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-xl bg-[#86efac] text-black">
          {isSignup ? <UserPlus className="h-5 w-5" /> : <LockKeyhole className="h-5 w-5" />}
        </div>

        <h1 className="text-2xl font-medium">{isSignup ? "Create account" : "Sign in"}</h1>
        <p className="mt-2 text-sm leading-6 text-[#919191]">
          {isSignup
            ? "Create an account, then verify your email before signing in."
            : "Use the email and password for your verified account."}
        </p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email" className="text-[#E7E7E7]">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 border-white/10 bg-black/40 text-white focus-visible:ring-[#86efac]/30"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-[#E7E7E7]">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 border-white/10 bg-black/40 text-white focus-visible:ring-[#86efac]/30"
            />
          </div>

          {message ? (
            <p className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm leading-5 text-[#E7E7E7]">
              {message}
            </p>
          ) : null}

          {needsVerification ? (
            <div className="rounded-lg border border-[#86efac]/30 bg-[#86efac]/10 p-3">
              <div className="flex items-start gap-3 text-sm leading-5 text-[#E7E7E7]">
                <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#86efac]" />
                <p>Verify your email before logging in. If it did not arrive, send the verification email again.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={isResending}
                onClick={handleResendVerification}
                className="mt-3 h-10 w-full border-white/10 bg-black/40 text-white hover:bg-[#1F1F1F] hover:text-white"
              >
                <Send className="h-4 w-4" />
                {isResending ? "Sending..." : "Send verification email"}
              </Button>
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-11 w-full bg-[#86efac] text-black hover:bg-[#6ee7b7]"
          >
            {isSignup ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
            {isSubmitting ? "Working..." : isSignup ? "Sign up" : "Log in"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-[#919191]">
          {isSignup ? "Already have access?" : "Need access?"}{" "}
          <Link href={isSignup ? "/login" : "/signup"} className="text-white underline-offset-4 hover:underline">
            {isSignup ? "Log in" : "Sign up"}
          </Link>
        </div>
      </section>
    </main>
  )
}
