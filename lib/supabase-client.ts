"use client"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const fallbackSupabaseUrl = "https://qblvpnlacnlploddrxxc.supabase.co"
const fallbackSupabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFibHZwbmxhY25scGxvZGRyeHhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNDk2NTMsImV4cCI6MjA5MzkyNTY1M30.O4kg-poaGSbMa1i1_02pv8tRO09z_oWTP9qEi1BCKD4"

function getPublicSupabaseConfig() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const configuredAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  const hasPlaceholderKey = !configuredAnonKey || configuredAnonKey === "your_anon_key"

  return {
    anonKey: hasPlaceholderKey ? fallbackSupabaseAnonKey : configuredAnonKey,
    url: configuredUrl || fallbackSupabaseUrl,
  }
}

let browserSupabaseClient: SupabaseClient | null = null

export function isSupabaseConfigured() {
  const { url, anonKey } = getPublicSupabaseConfig()
  return Boolean(url && anonKey)
}

export function getSupabaseBrowserClient() {
  const { url: resolvedSupabaseUrl, anonKey: resolvedSupabaseAnonKey } = getPublicSupabaseConfig()

  if (!resolvedSupabaseUrl || !resolvedSupabaseAnonKey) {
    throw new Error("Supabase public environment variables are not configured.")
  }

  if (!browserSupabaseClient) {
    browserSupabaseClient = createClient(resolvedSupabaseUrl, resolvedSupabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }

  return browserSupabaseClient
}
