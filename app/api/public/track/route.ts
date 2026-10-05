import { createPublicClient } from "@/lib/supabase/public"
import { preflight, jsonWithCors } from "@/lib/public-cors"
import { intakeIsDryRun, readBoundedJson } from "@/lib/website/intake-guard"
import { parseTrackBody } from "@/lib/website/track-intake"
import { getPublishedDocumentStrict } from "@/lib/website/store"
import { effectiveAnalytics } from "@/lib/website/analytics-server"
import { resolveRuntime } from "@/lib/website/analytics"
import { isIndexableDeployment } from "@/lib/website/env"

export const runtime = "nodejs"

export function OPTIONS(request: Request) {
  return preflight(request)
}

/** First-party counting is on only when the PUBLISHED config enables it on the production deployment. */
async function publishedTrackingEnabled(): Promise<boolean> {
  try {
    const doc = await getPublishedDocumentStrict()
    if (!doc) return false
    const cfg = await effectiveAnalytics(doc)
    return resolveRuntime(cfg, "", { preview: false, indexable: isIndexableDeployment() }).firstParty
  } catch {
    return false
  }
}

/**
 * Public first-party analytics ingestion. Best-effort, no notifications.
 * Lead/appointment intake is separate and never depends on this route.
 * Writes only through the anon-granted `ingest_website_event` RPC.
 */
export async function POST(request: Request) {
  try {
    const raw = await readBoundedJson(request)
    if (!raw) return jsonWithCors(request, { ok: false, error: "bad_request" }, 413)
    const ua = request.headers.get("user-agent") || ""
    const parsed = parseTrackBody(raw, ua)
    if (!parsed.ok) return jsonWithCors(request, { ok: false, error: parsed.error }, 400)

    if (await intakeIsDryRun()) return jsonWithCors(request, { ok: true, outcome: "dry_run" })
    if (!(await publishedTrackingEnabled())) return jsonWithCors(request, { ok: true, outcome: "disabled" })

    const r = parsed.record
    const { error } = await createPublicClient().rpc("ingest_website_event", {
      p_event_type: r.eventType,
      p_session_id: r.sessionId,
      p_page_path: r.pagePath,
      p_referrer: r.referrer,
      p_source: r.source,
      p_medium: r.medium,
      p_campaign: r.campaign,
      p_device: r.device,
      p_user_agent: ua.slice(0, 512),
      p_metadata: r.metadata,
    })
    if (error) return jsonWithCors(request, { ok: false, error: "ingest_failed" }, 400)
    return jsonWithCors(request, { ok: true, outcome: "recorded" })
  } catch {
    return jsonWithCors(request, { ok: false, error: "server_error" }, 500)
  }
}
