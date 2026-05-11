"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { LoaderCircle, MailCheck } from "lucide-react"
import type { EmailOtpType } from "@supabase/supabase-js"

import { isSupabaseConfigured, supabase } from "@/lib/supabase-client"

export default function AuthCallbackPage() {
  const router = useRouter()
  const [message, setMessage] = useState("Verifying your email...")

  useEffect(() => {
    let isMounted = true

    async function verifyEmail() {
      if (!isSupabaseConfigured()) {
        setMessage("Supabase is not configured for this site.")
        return
      }

      const params = new URLSearchParams(window.location.search)
      const code = params.get("code")
      const tokenHash = params.get("token_hash")
      const type = params.get("type") as EmailOtpType | null
      const errorDescription = params.get("error_description")

      if (errorDescription) {
        setMessage(errorDescription)
        return
      }

      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type,
        })

        if (error) {
          setMessage(error.message)
          return
        }
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (error) {
          setMessage(error.message)
          return
        }
      } else {
        const { data, error } = await supabase.auth.getSession()

        if (error || !data.session) {
          setMessage(error?.message ?? "The verification link is invalid or has expired.")
          return
        }
      }

      if (!isMounted) {
        return
      }

      router.replace("/")
      router.refresh()
    }

    verifyEmail()

    return () => {
      isMounted = false
    }
  }, [router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 py-10 text-white">
      <section className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0D0D0D] p-6 text-center shadow-2xl shadow-black/40">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-[#86efac] text-black">
          <MailCheck className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-medium">Email verification</h1>
        <p className="mt-3 text-sm leading-6 text-[#E7E7E7]">{message}</p>
        {message === "Verifying your email..." ? (
          <LoaderCircle className="mx-auto mt-5 h-5 w-5 animate-spin text-[#86efac]" aria-hidden="true" />
        ) : null}
      </section>
    </main>
  )
}
