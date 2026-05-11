import { existsSync, readFileSync } from "node:fs"

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
]

function loadLocalEnvFile() {
  if (!existsSync(".env.local")) {
    return
  }

  const envFile = readFileSync(".env.local", "utf8")

  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)

    if (!match) {
      continue
    }

    const [, name, rawValue] = match

    if (!process.env[name]) {
      process.env[name] = rawValue.trim().replace(/^["']|["']$/g, "")
    }
  }
}

function fail(message) {
  console.error(`[supabase-env] ${message}`)
  process.exit(1)
}

function decodeJwtPayload(name, token) {
  const parts = token.split(".")

  if (parts.length !== 3) {
    fail(`${name} must be a Supabase JWT. Replace placeholder values in Vercel project settings.`)
  }

  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))
  } catch {
    fail(`${name} could not be decoded as a Supabase JWT.`)
  }
}

function projectRefFromUrl(rawUrl) {
  try {
    return new URL(rawUrl).hostname.split(".")[0]
  } catch {
    fail("NEXT_PUBLIC_SUPABASE_URL must be a valid Supabase URL.")
  }
}

loadLocalEnvFile()

const env = Object.fromEntries(requiredEnv.map((name) => [name, process.env[name]?.trim() ?? ""]))

for (const [name, value] of Object.entries(env)) {
  if (!value || value.startsWith("YOUR_") || value === "your_anon_key") {
    fail(`${name} is missing or still set to a placeholder.`)
  }
}

const projectRef = projectRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL)
const anonPayload = decodeJwtPayload("NEXT_PUBLIC_SUPABASE_ANON_KEY", env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const servicePayload = decodeJwtPayload("SUPABASE_SERVICE_ROLE_KEY", env.SUPABASE_SERVICE_ROLE_KEY)

if (anonPayload.role !== "anon") {
  fail("NEXT_PUBLIC_SUPABASE_ANON_KEY must be the project's anon key.")
}

if (servicePayload.role !== "service_role") {
  fail("SUPABASE_SERVICE_ROLE_KEY must be the project's service role key.")
}

if (anonPayload.ref !== projectRef || servicePayload.ref !== projectRef) {
  fail("Supabase URL, anon key, and service role key must all come from the same Supabase project.")
}

console.log(`[supabase-env] Supabase environment is valid for project ${projectRef}.`)
