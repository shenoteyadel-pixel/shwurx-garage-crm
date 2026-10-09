import { streamText } from "ai"
import { getPublishedDocumentStrict } from "@/lib/website/store"
import { readBoundedJson } from "@/lib/website/intake-guard"
import { ADVISOR_MODEL, advisorKnowledge, advisorSystemPrompt, cleanTranscript } from "@/lib/website/advisor-knowledge"

export const runtime = "nodejs"
export const maxDuration = 60

const WINDOW_MS = 10 * 60 * 1000
const MAX_REQUESTS = 25
// Best-effort per-instance throttle; it bounds abuse of a public model endpoint without new infrastructure.
const hits = new Map<string, number[]>()

function throttled(key: string): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) hits.clear()
  return recent.length > MAX_REQUESTS
}

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return new Response("Forbidden", { status: 403 })

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  if (throttled(ip)) return new Response("Too many questions. Please try again shortly.", { status: 429 })

  const body = await readBoundedJson(request)
  if (!body) return new Response("Bad request", { status: 400 })
  const messages = cleanTranscript(body.messages)
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return new Response("No question", { status: 400 })
  }
  const lang = body.locale === "ar" ? "ar" : "en"

  const doc = await getPublishedDocumentStrict()
  if (!doc) return new Response("Advisor unavailable", { status: 503 })

  const result = streamText({
    model: ADVISOR_MODEL,
    system: advisorSystemPrompt(advisorKnowledge(doc, lang), lang),
    messages,
    maxOutputTokens: 600,
    abortSignal: request.signal,
    onError: ({ error }) => {
      console.error("public advisor stream error:", (error as Error)?.message)
    },
  })

  return result.toTextStreamResponse()
}
