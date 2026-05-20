import { z } from "zod"

const finbertModel = "ProsusAI/finbert"
const finbertInferenceUrl = `https://api-inference.huggingface.co/models/${finbertModel}`
const maxSentimentTexts = 8
const maxSentimentTextLength = 900

const sentimentLabelSchema = z.enum(["positive", "negative", "neutral"])

const sentimentScoreSchema = z.object({
  label: z.string(),
  score: z.number(),
})

const sentimentResponseSchema = z.union([
  z.array(sentimentScoreSchema),
  z.array(z.array(sentimentScoreSchema)),
])

export type FinancialSentimentLabel = z.infer<typeof sentimentLabelSchema> | "unavailable"

export type FinancialSentimentSummary = {
  provider: "ProsusAI/finbert" | "Unavailable"
  model: string
  label: FinancialSentimentLabel
  score: number
  positive: number
  negative: number
  neutral: number
  textCount: number
  evidence: string[]
  message: string
  updatedAt: string
}

function getHuggingFaceToken() {
  return process.env.HUGGING_FACE_API_KEY?.trim() || process.env.HUGGINGFACE_API_KEY?.trim() || process.env.HF_TOKEN?.trim()
}

function unavailableSentiment(message: string, textCount = 0): FinancialSentimentSummary {
  return {
    provider: "Unavailable",
    model: finbertModel,
    label: "unavailable",
    score: 0,
    positive: 0,
    negative: 0,
    neutral: 0,
    textCount,
    evidence: [],
    message,
    updatedAt: new Date().toISOString(),
  }
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

function trimText(text: string) {
  const normalized = normalizeText(text)

  return normalized.length > maxSentimentTextLength
    ? `${normalized.slice(0, maxSentimentTextLength - 3).trim()}...`
    : normalized
}

function normalizeLabel(label: string) {
  const normalized = label.toLowerCase().replace(/^label_/, "")

  return sentimentLabelSchema.safeParse(normalized).success ? (normalized as z.infer<typeof sentimentLabelSchema>) : null
}

function normalizePrediction(prediction: z.infer<typeof sentimentScoreSchema>[]) {
  const scores = {
    positive: 0,
    negative: 0,
    neutral: 0,
  }

  for (const item of prediction) {
    const label = normalizeLabel(item.label)

    if (label) {
      scores[label] = item.score
    }
  }

  return scores
}

function flattenPredictions(parsed: z.infer<typeof sentimentResponseSchema>) {
  if (parsed.length === 0) {
    return []
  }

  return Array.isArray(parsed[0]) ? (parsed as z.infer<typeof sentimentScoreSchema>[][]) : [parsed as z.infer<typeof sentimentScoreSchema>[]]
}

export async function analyzeFinancialSentiment(texts: string[]): Promise<FinancialSentimentSummary> {
  const cleanedTexts = texts.map(trimText).filter((text) => text.length >= 20).slice(0, maxSentimentTexts)
  const token = getHuggingFaceToken()

  if (!cleanedTexts.length) {
    return unavailableSentiment("No earnings-call text was available for FinBERT sentiment analysis.")
  }

  if (!token) {
    return unavailableSentiment("Add HUGGING_FACE_API_KEY or HF_TOKEN to enable ProsusAI/finbert sentiment inference.", cleanedTexts.length)
  }

  try {
    const response = await fetch(finbertInferenceUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: cleanedTexts,
        options: { wait_for_model: true },
      }),
      next: { revalidate: 60 * 60 },
    })

    if (!response.ok) {
      return unavailableSentiment(`ProsusAI/finbert inference failed with ${response.status}.`, cleanedTexts.length)
    }

    const parsed = sentimentResponseSchema.safeParse(await response.json())

    if (!parsed.success) {
      return unavailableSentiment("ProsusAI/finbert returned an unexpected sentiment payload.", cleanedTexts.length)
    }

    const predictions = flattenPredictions(parsed.data).map(normalizePrediction)

    if (!predictions.length) {
      return unavailableSentiment("ProsusAI/finbert did not return usable sentiment probabilities.", cleanedTexts.length)
    }

    const totals = predictions.reduce(
      (current, prediction) => ({
        positive: current.positive + prediction.positive,
        negative: current.negative + prediction.negative,
        neutral: current.neutral + prediction.neutral,
      }),
      { positive: 0, negative: 0, neutral: 0 },
    )
    const count = predictions.length
    const positive = totals.positive / count
    const negative = totals.negative / count
    const neutral = totals.neutral / count
    const score = positive - negative
    const label = Object.entries({ positive, negative, neutral }).sort((first, second) => second[1] - first[1])[0][0] as FinancialSentimentLabel

    return {
      provider: "ProsusAI/finbert",
      model: finbertModel,
      label,
      score,
      positive,
      negative,
      neutral,
      textCount: count,
      evidence: cleanedTexts.slice(0, 3),
      message: `Analyzed ${count} earnings-call text chunk${count === 1 ? "" : "s"} with ProsusAI/finbert.`,
      updatedAt: new Date().toISOString(),
    }
  } catch (error) {
    return unavailableSentiment(error instanceof Error ? error.message : "ProsusAI/finbert sentiment inference failed.", cleanedTexts.length)
  }
}
