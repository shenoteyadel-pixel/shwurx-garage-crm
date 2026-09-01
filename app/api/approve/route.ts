import { NextResponse } from "next/server"
import { createPublicClient } from "@/lib/supabase/public"

export async function POST(request: Request) {
  try {
    const { token, decision, comment, signature } = await request.json()
    if (!token || !["approved", "rejected"].includes(decision)) {
      return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 })
    }
    const supabase = createPublicClient()
    const { data, error } = await supabase.rpc("submit_approval", {
      p_token: token,
      p_decision: decision,
      p_comment: comment ?? null,
      p_signature: signature ?? null,
    })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 })
  }
}
