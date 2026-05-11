import { z } from "zod"

const wrdsBaseUrl = "https://wrds-api.wharton.upenn.edu"

const wrdsTableNameSchema = z.string().regex(/^factset\.[a-z0-9_]+$/)
const wrdsFieldNameSchema = z.string().regex(/^[a-z0-9_]+$/)

export const wrdsFactsetRequestSchema = z.object({
  table: wrdsTableNameSchema.default("factset.ff_basic_af_am"),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  filters: z.record(wrdsFieldNameSchema, z.string().trim().min(1).max(128)).default({}),
})

export type WrdsFactsetRequest = z.infer<typeof wrdsFactsetRequestSchema>

type WrdsDataResponse = {
  count?: number
  next?: string | null
  previous?: string | null
  results?: Array<Record<string, unknown>>
}

function getWrdsToken() {
  return process.env.WRDS_API_TOKEN?.trim() ?? process.env.FACTSET_ACCESS_TOKEN?.trim() ?? null
}

function buildWrdsUrl(request: WrdsFactsetRequest) {
  const url = new URL(`/data/${request.table}/`, wrdsBaseUrl)
  url.searchParams.set("limit", String(request.limit))
  url.searchParams.set("offset", String(request.offset))

  for (const [field, value] of Object.entries(request.filters)) {
    url.searchParams.set(field, value)
  }

  return url
}

export async function fetchWrdsFactsetRows(request: WrdsFactsetRequest) {
  const token = getWrdsToken()
  const updatedAt = new Date().toISOString()

  if (!token) {
    return {
      provider: "WRDS FactSet",
      ok: false,
      isConfigured: false,
      table: request.table,
      count: 0,
      results: [] as Array<Record<string, unknown>>,
      message: "WRDS is not configured. Add WRDS_API_TOKEN to .env.local.",
      updatedAt,
    }
  }

  const response = await fetch(buildWrdsUrl(request), {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Token ${token}`,
    },
  })

  if (!response.ok) {
    return {
      provider: "WRDS FactSet",
      ok: false,
      isConfigured: true,
      upstreamStatus: response.status,
      table: request.table,
      count: 0,
      results: [] as Array<Record<string, unknown>>,
      message: `WRDS request failed with ${response.status} ${response.statusText}.`,
      updatedAt,
    }
  }

  const payload = (await response.json()) as WrdsDataResponse
  const results = Array.isArray(payload.results) ? payload.results : []

  return {
    provider: "WRDS FactSet",
    ok: true,
    isConfigured: true,
    table: request.table,
    count: payload.count ?? results.length,
    next: payload.next ?? null,
    previous: payload.previous ?? null,
    results,
    message: `${results.length} WRDS rows loaded from ${request.table}.`,
    updatedAt,
  }
}

export async function fetchWrdsFactsetEndpoints() {
  const token = getWrdsToken()
  const updatedAt = new Date().toISOString()

  if (!token) {
    return {
      provider: "WRDS FactSet",
      ok: false,
      isConfigured: false,
      endpoints: [] as string[],
      message: "WRDS is not configured. Add WRDS_API_TOKEN to .env.local.",
      updatedAt,
    }
  }

  const response = await fetch(new URL("/data/", wrdsBaseUrl), {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Token ${token}`,
    },
  })

  if (!response.ok) {
    return {
      provider: "WRDS FactSet",
      ok: false,
      isConfigured: true,
      upstreamStatus: response.status,
      endpoints: [] as string[],
      message: `WRDS endpoint index failed with ${response.status} ${response.statusText}.`,
      updatedAt,
    }
  }

  const data = (await response.json()) as Record<string, string>
  const endpoints = Object.keys(data)
    .filter((key) => key.startsWith("factset."))
    .sort()

  return {
    provider: "WRDS FactSet",
    ok: true,
    isConfigured: true,
    endpoints,
    message: `${endpoints.length} WRDS FactSet endpoints found.`,
    updatedAt,
  }
}
