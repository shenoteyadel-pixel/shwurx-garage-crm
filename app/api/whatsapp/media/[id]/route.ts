import { NextResponse, type NextRequest } from "next/server"
import { get } from "@vercel/blob"
import { createServiceClient } from "@/lib/supabase/server"
import { getSessionContext, ctxCan } from "@/lib/rbac/context"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getSessionContext()
  if (!ctx || !ctx.isStaff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const all = ctxCan(ctx, "whatsapp.view_all")
  if (!all && !ctxCan(ctx, "whatsapp.view_own")) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const svc = createServiceClient()
  const { data: msg } = await svc
    .from("wa_messages")
    .select("media_blob_path, media_mime, wa_conversations(assigned_to)")
    .eq("id", id)
    .maybeSingle()
  if (!msg?.media_blob_path) return new NextResponse("Not found", { status: 404 })
  const owner = (msg.wa_conversations as unknown as { assigned_to: string | null } | null)?.assigned_to
  if (!all && owner && owner !== ctx.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  if (msg.media_blob_path.startsWith("http")) return NextResponse.redirect(msg.media_blob_path)

  const result = await get(msg.media_blob_path, { access: "private" })
  if (!result || result.statusCode !== 200) return new NextResponse("Not found", { status: 404 })
  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": msg.media_mime || result.blob.contentType,
      "Cache-Control": "private, max-age=3600",
    },
  })
}
