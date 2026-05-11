"use client"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

let browserSupabaseClient: SupabaseClient | null = null

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey)
}

export function getSupabaseBrowserClient() {
  const resolvedSupabaseUrl = supabaseUrl
  const resolvedSupabaseAnonKey = supabaseAnonKey

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
