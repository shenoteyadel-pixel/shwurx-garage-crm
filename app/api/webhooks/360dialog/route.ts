import { NextResponse, type NextRequest } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { createServiceClient } from "@/lib/supabase/server"
import { processWebhook, webhookSchema } from "@/lib/whatsapp-ingest"
import { webhookSecret } from "@/lib/d360"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function secretOk(req: NextRequest): boolean {
  const expected = webhookSecret()
  if (!expected) return false
  const provided = req.headers.get("x-wurx-webhook-secret") ?? req.nextUrl.searchParams.get("secret") ?? ""
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  const svc = createServiceClient()
  const raw = await req.text()
  let payload: unknown = null
  try {
    payload = JSON.parse(raw)
  } catch {
    payload = { unparsable: raw.slice(0, 2000) }
  }

  const authorized = secretOk(req)
  const { data: event } = await svc
    .from("wa_webhook_events")
    .insert({ signature_ok: authorized, payload })
    .select("id")
    .single()

  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = webhookSchema.safeParse(payload)
  if (!parsed.success) {
    if (event) await svc.from("wa_webhook_events").update({ error: "invalid payload" }).eq("id", event.id)
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  try {
    await processWebhook(parsed.data)
    if (event) await svc.from("wa_webhook_events").update({ processed: true }).eq("id", event.id)
  } catch (err) {
    const message = (err as Error).message
    console.error("360dialog webhook processing failed:", message)
    if (event) await svc.from("wa_webhook_events").update({ error: message }).eq("id", event.id)
    // 500 makes 360dialog retry; duplicates are ignored via the unique wamid.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
