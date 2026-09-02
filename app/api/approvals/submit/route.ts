import { NextResponse } from "next/server"
import { createPublicClient } from "@/lib/supabase/public"
import { notifyApprovalDecision } from "@/lib/actions-approvals"

/**
 * Public, anon submit endpoint for the per-item approval flow.
 * Captures the signer's IP + user-agent server-side (never trusted from the
 * client) and records the signed decisions through the SECURITY DEFINER RPC.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { token, decisions, signerName, signature, comment } = body ?? {}

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

    // Resolve the job (token-scoped) and notify staff of the outcome.
    try {
      const { data: req } = await supabase.rpc("get_approval_by_token", { p_token: token })
      const jobId = (req as any)?.job?.id
      if (jobId) await notifyApprovalDecision(jobId as string, String(data.status))
    } catch {
      /* notification is best-effort */
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 })
  }
}
