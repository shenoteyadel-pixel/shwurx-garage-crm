import { NextResponse, type NextRequest } from "next/server"
import { googleWebhookKeyCandidates, insertAdLead, logAdEvent, normalizePhone } from "@/lib/ad-leads"
import { matchWebhookKey } from "@/lib/webhook-keys"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface GoogleLeadPayload {
  lead_id?: string
  google_key?: string
  is_test?: boolean
  campaign_id?: string | number
  adgroup_id?: string | number
  creative_id?: string | number
  form_id?: string | number
  gcl_id?: string
  api_version?: string
  user_column_data?: { column_id?: string; column_name?: string; string_value?: string }[]
}

/** Google Ads lead form webhook. Google sends the configured key back as google_key. */
export async function POST(req: NextRequest) {
  let payload: GoogleLeadPayload
  try {
    payload = (await req.json()) as GoogleLeadPayload
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const keySlot = matchWebhookKey(payload.google_key, googleWebhookKeyCandidates())
  const authorized = keySlot !== null
  const { google_key: _omit, ...loggable } = payload
  const event = await logAdEvent("google", authorized, { ...loggable, auth_key_slot: keySlot })
  if (!authorized) {
    await event.finish({ processed: false, error: "invalid google_key" })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!payload.lead_id) {
    await event.finish({ processed: false, error: "missing lead_id" })
    return NextResponse.json({ error: "Missing lead_id" }, { status: 400 })
  }

  const cols: Record<string, string> = {}
  for (const c of payload.user_column_data ?? []) {
    const key = (c.column_id || c.column_name || "").toUpperCase()
    if (key && c.string_value) cols[key] = c.string_value
  }
  const take = (k: string) => {
    const v = cols[k] ?? null
    delete cols[k]
    return v
  }
  const full = take("FULL_NAME")
  const first = take("FIRST_NAME")
  const last = take("LAST_NAME")
  const name = full || [first, last].filter(Boolean).join(" ") || null
  const phone = normalizePhone(take("PHONE_NUMBER") ?? take("WORK_PHONE"))
  const email = take("EMAIL") ?? take("WORK_EMAIL")
  const extra = Object.fromEntries(Object.entries(cols).map(([k, v]) => [k.toLowerCase(), v]))

  try {
    const created = await insertAdLead({
      externalId: `google:${payload.lead_id}`,
      source: "google_ads",
      name: payload.is_test ? `${name ?? "Google lead"} (test)` : name,
      phone,
      email,
      extra,
      metadata: {
        provider: "google",
        test: payload.is_test ?? false,
        campaign: payload.campaign_id != null ? `Google campaign ${payload.campaign_id}` : null,
        campaign_id: payload.campaign_id ?? null,
        adgroup_id: payload.adgroup_id ?? null,
        creative_id: payload.creative_id ?? null,
        form_id: payload.form_id ?? null,
        gclid: payload.gcl_id ?? null,
      },
    })
    await event.finish({ processed: true, leads: created ? 1 : 0 })
  } catch (err) {
    const message = (err as Error).message
    await event.finish({ processed: false, error: message })
    return NextResponse.json({ error: "Processing failed" }, { status: 500 })
  }

  return NextResponse.json({})
}
