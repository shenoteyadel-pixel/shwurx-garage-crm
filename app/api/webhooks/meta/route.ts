import { NextResponse, type NextRequest } from "next/server"
import { createHmac } from "node:crypto"
import { logAdEvent, metaVerifyToken, safeEqual } from "@/lib/ad-leads"
import { fetchMetaLead, saveMetaLead } from "@/lib/meta-leads"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Meta subscription handshake: echo hub.challenge when the verify token matches. */
export function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const expected = metaVerifyToken()
  if (p.get("hub.mode") === "subscribe" && expected && safeEqual(p.get("hub.verify_token") ?? "", expected)) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } })
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}

interface LeadgenChange {
  field?: string
  value?: { leadgen_id?: string; page_id?: string; form_id?: string; ad_id?: string; adgroup_id?: string; created_time?: number }
}

function signatureOk(req: NextRequest, raw: string): boolean | null {
  const secret = process.env.META_APP_SECRET
  if (!secret) return null
  const header = req.headers.get("x-hub-signature-256") ?? ""
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`
  return safeEqual(header, expected)
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  let payload: { object?: string; entry?: { id?: string; changes?: LeadgenChange[] }[] } = {}
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const sig = signatureOk(req, raw)
  const event = await logAdEvent("meta", sig !== false, payload)
  if (sig === false) {
    await event.finish({ processed: false, error: "invalid signature" })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = process.env.META_PAGE_ACCESS_TOKEN
  if (!token) {
    await event.finish({ processed: false, error: "META_PAGE_ACCESS_TOKEN is not configured" })
    // 200 so Meta keeps the subscription alive; leads can be re-pulled from Ads Manager.
    return NextResponse.json({ ok: false })
  }

  const ids = (payload.entry ?? [])
    .flatMap((e) => e.changes ?? [])
    .filter((c) => c.field === "leadgen" && c.value?.leadgen_id)
    .map((c) => c.value!)

  let created = 0
  let testPings = 0
  const errors: string[] = []
  for (const v of ids) {
    // The "Test" button in Meta's webhook dashboard sends this placeholder ID, which never exists in the Graph API.
    if (v.leadgen_id === META_SAMPLE_LEADGEN_ID) {
      testPings++
      continue
    }
    try {
      // Fetching from the Graph API with our page token also proves the lead is genuine.
      const lead = await fetchMetaLead(v.leadgen_id!, token)
      const inserted = await saveMetaLead(lead, { pageId: v.page_id, formId: v.form_id, adId: v.ad_id })
      if (inserted) created++
    } catch (err) {
      errors.push(`${v.leadgen_id}: ${(err as Error).message}`)
    }
  }

  await event.finish({ processed: errors.length === 0, leads: created, error: errors.join("; ") || null })
  return NextResponse.json({ ok: true, created, testPings })
}

const META_SAMPLE_LEADGEN_ID = "444444444444"
