import { NextResponse, after } from "next/server"
import { createPublicClient } from "@/lib/supabase/public"
import { createServiceClient } from "@/lib/supabase/server"
import { notifyApprovalDecision, notifyManagementAllLinesDecided } from "@/lib/actions-approvals"

/**
 * Public, anon submit endpoint for the per-item approval flow.
 * Captures the signer's IP + user-agent server-side (never trusted from the
 * client) and records the signed decisions through the SECURITY DEFINER RPC.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { token, decisions, signerName, signature, comment, confirmedTotal } = body ?? {}
    const confirmed =
      confirmedTotal === null || confirmedTotal === undefined ? null : Number(confirmedTotal)
    if (confirmed !== null && !Number.isFinite(confirmed)) {
      return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 })
    }

    if (!token || typeof token !== "string") {
      return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 })
    }
    if (!decisions || typeof decisions !== "object") {
      return NextResponse.json({ ok: false, error: "no_decisions" }, { status: 400 })
    }
    if (!signerName?.trim() || !signature) {
      return NextResponse.json({ ok: false, error: "signature_required" }, { status: 400 })
    }

    const fwd = request.headers.get("x-forwarded-for") || ""
    const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown"
    const ua = request.headers.get("user-agent") || "unknown"

    const svc = createServiceClient()
    const { data: pending } = await svc
      .from("approval_requests")
      .select("id, job_id, mode, status, snapshot, vat_rate, vat_inclusive, title, created_by")
      .eq("token", token)
      .maybeSingle()
    if (!pending) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 })

    const snapItems: any[] = (pending.snapshot as any)?.items ?? []
    const itemKeys = new Set(snapItems.map((i) => String(i.key)))

    // Price-pending parts (no confirmed price) can never be approved as final.
    if (pending.mode !== "whole") {
      for (const it of snapItems) {
        if (decisions[it.key] === "approved" && isPricePending(it)) {
          return NextResponse.json({ ok: false, error: "price_pending" }, { status: 400 })
        }
      }
    }

    // "Decide later" items: excluded from this decision and re-issued as a new
    // pending request so the customer can answer them afterwards.
    const deferred: string[] =
      pending.mode === "whole" || !Array.isArray(body.deferred)
        ? []
        : Array.from(
            new Set(
              (body.deferred as unknown[])
                .map(String)
                .filter((k) => itemKeys.has(k) && decisions[k] !== "approved"),
            ),
          )
    const cleanDecisions: Record<string, string> = {}
    for (const [k, v] of Object.entries(decisions as Record<string, unknown>)) {
      if (deferred.includes(k)) continue
      if (k === "__whole__" || itemKeys.has(k)) cleanDecisions[k] = v === "approved" ? "approved" : "rejected"
    }

    const supabase = createPublicClient()
    const { data, error } = await supabase.rpc("submit_item_approval", {
      p_token: token,
      p_decisions: cleanDecisions,
      p_signer_name: signerName.trim(),
      p_signature: signature,
      p_comment: comment ?? null,
      p_ip: ip,
      p_user_agent: ua,
    })

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    if (!data?.ok) return NextResponse.json(data, { status: 400 })

    let followUpToken: string | null = null
    if (deferred.length && pending.job_id) {
      followUpToken = await reissueDeferred(svc, pending, snapItems.filter((i) => deferred.includes(String(i.key))))
    }

    // Record the customer's explicit confirmation of the final total, but only
    // when it matches the total the database computed from their decisions.
    const { data: signed } = await svc
      .from("approval_requests")
      .select("id, job_id, approved_total")
      .eq("token", token)
      .maybeSingle()
    const serverTotal = Number(signed?.approved_total ?? 0)
    const totalMatches = confirmed !== null && Math.abs(confirmed - serverTotal) < 0.01
    if (signed && totalMatches) {
      await svc
        .from("approval_requests")
        .update({ total_confirmed_at: new Date().toISOString(), total_confirmed_amount: serverTotal })
        .eq("id", signed.id)
        .is("total_confirmed_at", null)
    }

    // The customer's decision is already saved. Notify staff AFTER the response
    // is sent so slow email/WhatsApp I/O can never delay (and time out) the
    // customer's request — that timeout was surfacing as a "Network error".
    after(async () => {
      try {
        const jobId = signed?.job_id as string | undefined
        if (jobId) {
          await notifyApprovalDecision(jobId, String(data.status))
          await notifyManagementAllLinesDecided(jobId, String(data.status), serverTotal, totalMatches)
        }
      } catch {
        /* notification is best-effort */
      }
    })

    return NextResponse.json({ ...data, followUpToken, deferredCount: deferred.length })
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 })
  }
}

function isPricePending(it: any) {
  return it?.kind === "part" && !(Number(it.unit_price) > 0)
}

async function reissueDeferred(
  svc: ReturnType<typeof createServiceClient>,
  source: { job_id: string; vat_rate: number; vat_inclusive: boolean; title: string | null; created_by: string | null },
  items: any[],
): Promise<string | null> {
  if (!items.length) return null
  const round2 = (n: number) => Math.round(n * 100) / 100
  const subtotal = round2(items.reduce((s, i) => s + (Number(i.net) || 0), 0))
  const vatAmount = round2(items.reduce((s, i) => s + (Number(i.vat) || 0), 0))

  const { data: last } = await svc
    .from("approval_requests")
    .select("version")
    .eq("job_id", source.job_id)
    .eq("kind", "additional_work")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: inserted } = await svc
    .from("approval_requests")
    .insert({
      job_id: source.job_id,
      version: Number(last?.version ?? 0) + 1,
      kind: "additional_work",
      mode: "per_item",
      status: "pending",
      title: "Items saved for later",
      snapshot: { items },
      vat_rate: source.vat_rate,
      vat_inclusive: source.vat_inclusive,
      subtotal,
      vat_amount: vatAmount,
      total: round2(subtotal + vatAmount),
      sent_at: new Date().toISOString(),
      created_by: source.created_by,
    })
    .select("token")
    .single()
  return (inserted?.token as string) ?? null
}
