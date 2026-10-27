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

    const supabase = createPublicClient()
    const { data, error } = await supabase.rpc("submit_item_approval", {
      p_token: token,
      p_decisions: decisions,
      p_signer_name: signerName.trim(),
      p_signature: signature,
      p_comment: comment ?? null,
      p_ip: ip,
      p_user_agent: ua,
    })

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    if (!data?.ok) return NextResponse.json(data, { status: 400 })

    // Record the customer's explicit confirmation of the final total, but only
    // when it matches the total the database computed from their decisions.
    const svc = createServiceClient()
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

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 })
  }
}
