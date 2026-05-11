import { createClient } from "@supabase/supabase-js"
import { validateSupabaseEnv } from "@/lib/supabase-env"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

export function isSupabasePublicConfigured() {
  return validateSupabaseEnv({ url: supabaseUrl, anonKey: supabaseAnonKey }).ok
}

export function isSupabaseAdminConfigured() {
  return validateSupabaseEnv({ url: supabaseUrl, anonKey: supabaseAnonKey, serviceRoleKey: supabaseServiceRoleKey }).ok
}

export function createSupabaseAdminClient() {
  const validation = validateSupabaseEnv({
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    serviceRoleKey: supabaseServiceRoleKey,
  })

  if (!validation.ok || !supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(validation.ok ? "Supabase admin environment variables are not configured." : validation.error)
  }

  const resolvedSupabaseUrl = supabaseUrl
  const resolvedSupabaseServiceRoleKey = supabaseServiceRoleKey

  return createClient(resolvedSupabaseUrl, resolvedSupabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export function createSupabaseServerClient() {
  const validation = validateSupabaseEnv({ url: supabaseUrl, anonKey: supabaseAnonKey })

  if (!validation.ok || !supabaseUrl || !supabaseAnonKey) {
    throw new Error(validation.ok ? "Supabase public environment variables are not configured." : validation.error)
  }

  const resolvedSupabaseUrl = supabaseUrl
  const resolvedSupabaseAnonKey = supabaseAnonKey

  return createClient(resolvedSupabaseUrl, resolvedSupabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
