type SupabaseEnvConfig = {
  anonKey?: string
  serviceRoleKey?: string
  url?: string
}

function decodeJwtPayload(token: string) {
  const parts = token.split(".")

  if (parts.length !== 3) {
    throw new Error("Supabase key is not a valid JWT.")
  }

  const normalizedPayload = parts[1].replace(/-/g, "+").replace(/_/g, "/")
  const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, "=")
  const decodedPayload =
    typeof Buffer === "undefined" ? atob(paddedPayload) : Buffer.from(parts[1], "base64url").toString("utf8")

  const payload = JSON.parse(decodedPayload) as {
    ref?: string
    role?: string
  }

  return payload
}

function getProjectRefFromUrl(url: string) {
  const parsed = new URL(url)
  return parsed.hostname.split(".")[0] ?? ""
}

export function validateSupabaseEnv(config: SupabaseEnvConfig) {
  const url = config.url?.trim()
  const anonKey = config.anonKey?.trim()
  const serviceRoleKey = config.serviceRoleKey?.trim()

  if (!url) {
    return { ok: false as const, error: "NEXT_PUBLIC_SUPABASE_URL is missing." }
  }

  let projectRef = ""

  try {
    projectRef = getProjectRefFromUrl(url)
  } catch {
    return { ok: false as const, error: "NEXT_PUBLIC_SUPABASE_URL is not a valid URL." }
  }

  if (anonKey) {
    try {
      const payload = decodeJwtPayload(anonKey)

      if (payload.role !== "anon") {
        return { ok: false as const, error: "NEXT_PUBLIC_SUPABASE_ANON_KEY is not an anon key." }
      }

      if (payload.ref !== projectRef) {
        return {
          ok: false as const,
          error: "NEXT_PUBLIC_SUPABASE_ANON_KEY does not belong to the Supabase project in NEXT_PUBLIC_SUPABASE_URL.",
        }
      }
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "NEXT_PUBLIC_SUPABASE_ANON_KEY is invalid.",
      }
    }
  }

  if (serviceRoleKey) {
    try {
      const payload = decodeJwtPayload(serviceRoleKey)

      if (payload.role !== "service_role") {
        return { ok: false as const, error: "SUPABASE_SERVICE_ROLE_KEY is not a service role key." }
      }

      if (payload.ref !== projectRef) {
        return {
          ok: false as const,
          error: "SUPABASE_SERVICE_ROLE_KEY does not belong to the Supabase project in NEXT_PUBLIC_SUPABASE_URL.",
        }
      }
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "SUPABASE_SERVICE_ROLE_KEY is invalid.",
      }
    }
  }

  return { ok: true as const }
}
