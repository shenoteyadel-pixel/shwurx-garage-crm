import { NextResponse, type NextRequest } from "next/server"
import { createHmac } from "node:crypto"
import { insertAdLead, logAdEvent, metaVerifyToken, normalizePhone, safeEqual } from "@/lib/ad-leads"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const GRAPH = "https://graph.facebook.com/v21.0"

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

interface GraphLead {
  id: string
  created_time?: string
  field_data?: { name: string; values?: string[] }[]
  ad_name?: string
  adset_name?: string
  campaign_name?: string
  form_id?: string
  platform?: string
  is_organic?: boolean
}

function signatureOk(req: NextRequest, raw: string): boolean | null {
  const secret = process.env.META_APP_SECRET
  if (!secret) return null
  const header = req.headers.get("x-hub-signature-256") ?? ""
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`
  return safeEqual(header, expected)
}

async function fetchLead(leadgenId: string, token: string): Promise<GraphLead> {
  const fields = "created_time,field_data,ad_name,adset_name,campaign_name,form_id,platform,is_organic"
  const res = await fetch(`${GRAPH}/${encodeURIComponent(leadgenId)}?fields=${fields}&access_token=${encodeURIComponent(token)}`, {
    cache: "no-store",
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error?.message ?? `Graph API ${res.status}`)
  return body as GraphLead
}

function mapFields(lead: GraphLead) {
  const fields: Record<string, string> = {}
  for (const f of lead.field_data ?? []) fields[f.name.toLowerCase()] = (f.values ?? []).join(", ")
  const take = (...keys: string[]) => {
    for (const k of keys) {
      const v = fields[k]
      if (v) {
        delete fields[k]
        return v
      }
    }
    return null
  }
  const full = take("full_name", "name")
  const first = take("first_name")
  const last = take("last_name")
  const name = full || [first, last].filter(Boolean).join(" ") || null
  const phone = normalizePhone(take("phone_number", "phone", "mobile_number", "whatsapp_number"))
  const email = take("email", "work_email")
  return { name, phone, email, extra: fields }
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
  const errors: string[] = []
  for (const v of ids) {
    try {
      // Fetching from the Graph API with our page token also proves the lead is genuine.
      const lead = await fetchLead(v.leadgen_id!, token)
      const mapped = mapFields(lead)
      const isInstagram = lead.platform === "ig" || lead.platform === "instagram"
      const inserted = await insertAdLead({
        externalId: `meta:${lead.id}`,
        source: isInstagram ? "instagram" : "facebook",
        ...mapped,
        metadata: {
          provider: "meta",
          platform: lead.platform ?? null,
          campaign: lead.campaign_name ?? null,
          adset: lead.adset_name ?? null,
          ad: lead.ad_name ?? null,
          form_id: lead.form_id ?? v.form_id ?? null,
          page_id: v.page_id ?? null,
          ad_id: v.ad_id ?? null,
          organic: lead.is_organic ?? false,
          submitted_at: lead.created_time ?? null,
        },
      })
      if (inserted) created++
    } catch (err) {
      errors.push(`${v.leadgen_id}: ${(err as Error).message}`)
    }
  }

  await event.finish({ processed: errors.length === 0, leads: created, error: errors.join("; ") || null })
  return NextResponse.json({ ok: true, created })
}
