import { z } from "zod"

import { loadSp500Universe, normalizeSymbol } from "@/lib/server-market-data"

const finnhubBaseUrl = "https://finnhub.io/api/v1"
const monitorTranscriptLimit = 25

const earningsEventSchema = z.object({
  date: z.string().optional(),
  epsActual: z.number().nullable().optional(),
  epsEstimate: z.number().nullable().optional(),
  hour: z.string().nullable().optional(),
  quarter: z.number().nullable().optional(),
  revenueActual: z.number().nullable().optional(),
  revenueEstimate: z.number().nullable().optional(),
  symbol: z.string(),
  year: z.number().nullable().optional(),
})

const earningsCalendarSchema = z.object({
  earningsCalendar: z.array(earningsEventSchema).optional(),
})

const transcriptMetadataSchema = z.object({
  id: z.string(),
  symbol: z.string().optional(),
  title: z.string().optional(),
  time: z.string().optional(),
  year: z.number().optional(),
  quarter: z.number().optional(),
})

const transcriptsListSchema = z.object({
  transcripts: z.array(transcriptMetadataSchema).optional(),
})

export type FinnhubEarningsEvent = z.infer<typeof earningsEventSchema>
export type FinnhubTranscriptMetadata = z.infer<typeof transcriptMetadataSchema>

export type FinnhubEarningsPayload = {
  symbol: string
  earningsEvents: FinnhubEarningsEvent[]
  transcripts: FinnhubTranscriptMetadata[]
  shouldRefreshModel: boolean
  refreshReason: string
  provider: "Finnhub" | "Unavailable"
  message: string
  updatedAt: string
}

export type FinnhubEarningsMonitorPayload = {
  checkedSymbols: string[]
  earningsEvents: FinnhubEarningsEvent[]
  transcriptSymbolsChecked: string[]
  transcriptCount: number
  provider: "Finnhub" | "Unavailable"
  message: string
  updatedAt: string
}

function getFinnhubToken() {
  return process.env.FINNHUB_API_KEY?.trim()
}

function isoDate(offsetDays: number) {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

function isEventInRefreshWindow(event: FinnhubEarningsEvent) {
  if (!event.date) {
    return false
  }

  const today = new Date(isoDate(0)).getTime()
  const eventTime = new Date(event.date).getTime()
  const dayMs = 24 * 60 * 60 * 1000

  return eventTime >= today - 2 * dayMs && eventTime <= today + 1 * dayMs
}

function latestTranscriptIsRecent(transcripts: FinnhubTranscriptMetadata[]) {
  const latest = transcripts
    .map((transcript) => transcript.time)
    .filter((time): time is string => Boolean(time))
    .sort((first, second) => second.localeCompare(first))[0]

  if (!latest) {
    return false
  }

  const latestTime = new Date(latest).getTime()
  const weekMs = 7 * 24 * 60 * 60 * 1000

  return Number.isFinite(latestTime) && Date.now() - latestTime <= weekMs
}

async function fetchFinnhubJson<T>(path: string, params: Record<string, string | boolean | undefined>, schema: z.ZodType<T>) {
  const token = getFinnhubToken()

  if (!token) {
    throw new Error("FINNHUB_API_KEY is not configured")
  }

  const url = new URL(`${finnhubBaseUrl}${path}`)

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value))
    }
  }

  url.searchParams.set("token", token)

  const response = await fetch(url, {
    next: { revalidate: 15 * 60 },
    headers: {
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(`Finnhub request failed with ${response.status}`)
  }

  return schema.parse(await response.json())
}

async function fetchEarningsCalendar(symbol: string | undefined, from: string, to: string) {
  const payload = await fetchFinnhubJson(
    "/calendar/earnings",
    { from, to, symbol, international: false },
    earningsCalendarSchema,
  )

  return payload.earningsCalendar ?? []
}

async function fetchTranscriptsList(symbol: string) {
  const payload = await fetchFinnhubJson("/stock/transcripts", { symbol }, transcriptsListSchema)

  return payload.transcripts ?? []
}

export async function loadFinnhubEarnings(symbol: string): Promise<FinnhubEarningsPayload> {
  const normalizedSymbol = normalizeSymbol(symbol)
  const updatedAt = new Date().toISOString()

  if (!getFinnhubToken()) {
    return {
      symbol: normalizedSymbol,
      earningsEvents: [],
      transcripts: [],
      shouldRefreshModel: false,
      refreshReason: "FINNHUB_API_KEY is not configured in .env.local.",
      provider: "Unavailable",
      message: "Add FINNHUB_API_KEY to .env.local to enable automatic earnings calendar and call transcript checks.",
      updatedAt,
    }
  }

  try {
    const [earningsEvents, transcripts] = await Promise.all([
      fetchEarningsCalendar(normalizedSymbol, isoDate(-14), isoDate(14)),
      fetchTranscriptsList(normalizedSymbol),
    ])
    const hasFreshEvent = earningsEvents.some(isEventInRefreshWindow)
    const hasFreshTranscript = latestTranscriptIsRecent(transcripts)
    const shouldRefreshModel = hasFreshEvent || hasFreshTranscript
    const refreshReason = hasFreshTranscript
      ? "New or recent earnings-call transcript metadata is available."
      : hasFreshEvent
        ? "An earnings release is inside the automatic refresh window."
        : "No near-term earnings release or recent call transcript was found."

    return {
      symbol: normalizedSymbol,
      earningsEvents,
      transcripts: transcripts.slice(0, 6),
      shouldRefreshModel,
      refreshReason,
      provider: "Finnhub",
      message: `Checked Finnhub earnings calendar and transcript metadata for ${normalizedSymbol}.`,
      updatedAt,
    }
  } catch (error) {
    return {
      symbol: normalizedSymbol,
      earningsEvents: [],
      transcripts: [],
      shouldRefreshModel: false,
      refreshReason: "Finnhub did not return usable earnings data.",
      provider: "Unavailable",
      message: error instanceof Error ? error.message : "Finnhub earnings check failed.",
      updatedAt,
    }
  }
}

export async function loadFinnhubEarningsMonitor(): Promise<FinnhubEarningsMonitorPayload> {
  const updatedAt = new Date().toISOString()

  if (!getFinnhubToken()) {
    return {
      checkedSymbols: [],
      earningsEvents: [],
      transcriptSymbolsChecked: [],
      transcriptCount: 0,
      provider: "Unavailable",
      message: "FINNHUB_API_KEY is not configured.",
      updatedAt,
    }
  }

  try {
    const universe = await loadSp500Universe()
    const universeSymbols = new Set(universe.securities.map((security) => security.symbol))
    const earningsEvents = (await fetchEarningsCalendar(undefined, isoDate(-1), isoDate(7))).filter((event) =>
      universeSymbols.has(normalizeSymbol(event.symbol)),
    )
    const dueSymbols = Array.from(new Set(earningsEvents.map((event) => normalizeSymbol(event.symbol)))).slice(
      0,
      monitorTranscriptLimit,
    )
    const transcriptResults = await Promise.all(dueSymbols.map((symbol) => fetchTranscriptsList(symbol).catch(() => [])))
    const transcriptCount = transcriptResults.reduce((total, transcripts) => total + transcripts.length, 0)

    return {
      checkedSymbols: Array.from(universeSymbols),
      earningsEvents,
      transcriptSymbolsChecked: dueSymbols,
      transcriptCount,
      provider: "Finnhub",
      message: `Checked ${earningsEvents.length} S&P 500 earnings events and transcript metadata for ${dueSymbols.length} due tickers.`,
      updatedAt,
    }
  } catch (error) {
    return {
      checkedSymbols: [],
      earningsEvents: [],
      transcriptSymbolsChecked: [],
      transcriptCount: 0,
      provider: "Unavailable",
      message: error instanceof Error ? error.message : "Finnhub earnings monitor failed.",
      updatedAt,
    }
  }
}
