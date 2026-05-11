import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

export function isSupabasePublicConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey)
}

export function isSupabaseAdminConfigured() {
  return Boolean(isSupabasePublicConfigured() && supabaseServiceRoleKey)
}

export function createSupabaseAdminClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase admin environment variables are not configured.")
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export function createSupabaseServerClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase public environment variables are not configured.")
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
