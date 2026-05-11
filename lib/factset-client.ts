import { z } from "zod"

const factsetBaseUrl = "https://api.factset.com/content/factset-fundamentals/v2"

const factsetFundamentalSchema = z.object({
  requestId: z.string().nullable().optional(),
  fsymId: z.string().nullable().optional(),
  metric: z.string().nullable().optional(),
  periodicity: z.string().nullable().optional(),
  fiscalPeriod: z.number().nullable().optional(),
  fiscalYear: z.number().nullable().optional(),
  fiscalPeriodLength: z.number().nullable().optional(),
  fiscalEndDate: z.string().nullable().optional(),
  reportDate: z.string().nullable().optional(),
  epsReportDate: z.string().nullable().optional(),
  updateType: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  value: z.union([z.string(), z.number()]).nullable().optional(),
})

const factsetFundamentalsResponseSchema = z.object({
  data: z.array(factsetFundamentalSchema).default([]),
})

export const factsetFundamentalsRequestSchema = z.object({
  ids: z.array(z.string().trim().min(1).max(64)).min(1).max(25).default(["AAPL-US"]),
  metrics: z.array(z.string().trim().min(1).max(64)).min(1).max(25).default(["FF_SALES", "FF_EPS", "FF_PE"]),
  periodicity: z.enum(["ANN", "ANN_R", "QTR", "QTR_R", "SEMI", "SEMI_R", "LTM", "LTM_R", "LTMSG", "LTM_SEMI", "YTD"]).default("ANN_R"),
  fiscalPeriodStart: z.string().trim().optional(),
  fiscalPeriodEnd: z.string().trim().optional(),
  currency: z.string().trim().min(3).max(5).default("USD"),
  updateType: z.enum(["RP", "RF"]).default("RP"),
})

export type FactsetFundamentalsRequest = z.infer<typeof factsetFundamentalsRequestSchema>
export type FactsetFundamental = z.infer<typeof factsetFundamentalSchema>

function getFactsetAuthorizationHeader() {
  const accessToken = process.env.FACTSET_ACCESS_TOKEN?.trim()

  if (accessToken) {
    return `Bearer ${accessToken}`
  }

  const username = process.env.FACTSET_USERNAME?.trim()
  const apiKey = process.env.FACTSET_API_KEY?.trim()

  if (username && apiKey) {
    return `Basic ${Buffer.from(`${username}:${apiKey}`).toString("base64")}`
  }

  return null
}

function appendCsvParam(params: URLSearchParams, key: string, values: string[]) {
  params.set(key, values.join(","))
}

export async function fetchFactsetFundamentals(input: FactsetFundamentalsRequest) {
  const authorization = getFactsetAuthorizationHeader()
  const updatedAt = new Date().toISOString()

  if (!authorization) {
    return {
      provider: "FactSet Fundamentals",
      ok: false,
      isConfigured: false,
      data: [] as FactsetFundamental[],
      message:
        "FactSet credentials are not configured. Add FACTSET_ACCESS_TOKEN, or FACTSET_USERNAME with FACTSET_API_KEY, to .env.local.",
      updatedAt,
    }
  }

  const url = new URL(`${factsetBaseUrl}/fundamentals`)
  appendCsvParam(url.searchParams, "ids", input.ids)
  appendCsvParam(url.searchParams, "metrics", input.metrics)
  url.searchParams.set("periodicity", input.periodicity)
  url.searchParams.set("currency", input.currency)
  url.searchParams.set("updateType", input.updateType)

  if (input.fiscalPeriodStart) {
    url.searchParams.set("fiscalPeriodStart", input.fiscalPeriodStart)
  }

  if (input.fiscalPeriodEnd) {
    url.searchParams.set("fiscalPeriodEnd", input.fiscalPeriodEnd)
  }

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: authorization,
    },
  })

  if (!response.ok) {
    return {
      provider: "FactSet Fundamentals",
      ok: false,
      isConfigured: true,
      upstreamStatus: response.status,
      data: [] as FactsetFundamental[],
      message: `FactSet request failed with ${response.status} ${response.statusText}.`,
      updatedAt,
    }
  }

  const parsed = factsetFundamentalsResponseSchema.safeParse(await response.json())

  if (!parsed.success) {
    return {
      provider: "FactSet Fundamentals",
      ok: false,
      isConfigured: true,
      data: [] as FactsetFundamental[],
      message: "FactSet responded, but the payload did not match the expected fundamentals shape.",
      updatedAt,
    }
  }

  return {
    provider: "FactSet Fundamentals",
    ok: true,
    isConfigured: true,
    data: parsed.data.data,
    message: `${parsed.data.data.length} FactSet Fundamentals records loaded.`,
    updatedAt,
  }
}
