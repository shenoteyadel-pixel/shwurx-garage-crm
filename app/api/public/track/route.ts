import { createPublicClient } from "@/lib/supabase/public"
import { preflight, jsonWithCors } from "@/lib/public-cors"
import { intakeIsDryRun, readBoundedJson } from "@/lib/website/intake-guard"
import { isPublicSitePath } from "@/lib/website/paths"

export const runtime = "nodejs"

export function OPTIONS(request: Request) {
  return preflight(request)
}

/**
 * Public website analytics ingestion. Called from the separate SHWURX
 * marketing site via the drop-in snippet. Fire-and-forget: high volume,
 * no notifications, best-effort. Writes only through the anon-granted
 * `ingest_website_event` SECURITY DEFINER RPC.
 */
export async function POST(request: Request) {
  try {
    const raw = await readBoundedJson(request)
    if (!raw) return jsonWithCors(request, { ok: false, error: "bad_request" }, 413)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = raw as any
    const eventType = String(body?.eventType ?? body?.event_type ?? "").trim()
    if (!eventType) {
      return jsonWithCors(request, { ok: false, error: "missing_event_type" }, 400)
    }
    // Never count preview traffic, and never accept CRM/token paths.
    if (await intakeIsDryRun()) return jsonWithCors(request, { ok: true, outcome: "dry_run" })
    const pagePath = String(body?.pagePath ?? body?.page_path ?? "")
    if (pagePath && !isPublicSitePath(pagePath.split("?")[0])) {
      return jsonWithCors(request, { ok: false, error: "non_public_path" }, 400)
    }

    // Device is derived server-side from the UA when the client doesn't send one.
    const ua = request.headers.get("user-agent") || ""
    const device =
      body?.device ??
      (/mobile/i.test(ua) ? "mobile" : /tablet|ipad/i.test(ua) ? "tablet" : "desktop")

    const supabase = createPublicClient()
    const { data, error } = await supabase.rpc("ingest_website_event", {
      p_event_type: eventType,
      p_session_id: body?.sessionId ?? body?.session_id ?? null,
      p_page_path: body?.pagePath ?? body?.page_path ?? null,
      p_referrer: body?.referrer ?? null,
      p_source: body?.source ?? null,
      p_medium: body?.medium ?? null,
      p_campaign: body?.campaign ?? null,
      p_device: device,
      p_user_agent: ua.slice(0, 512),
      p_metadata: body?.metadata && typeof body.metadata === "object" ? body.metadata : {},
    })

    if (error) return jsonWithCors(request, { ok: false, error: error.message }, 400)
    return jsonWithCors(request, data ?? { ok: true })
  } catch {
    return jsonWithCors(request, { ok: false, error: "server_error" }, 500)
  }
}
