import { type NextRequest, NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { createClient } from "@/lib/supabase/server"

// Issues a short-lived client token so the browser can upload a supplier
// invoice (photo / PDF) DIRECTLY to Vercel Blob. This is required because
// Server Actions run as serverless functions with a hard ~4.5MB request-body
// limit — a normal phone photo exceeds it and was rejected before the action
// ran, surfacing as an opaque "React error #441". Direct-to-Blob uploads
// bypass that limit entirely; the action then only receives the blob pathname.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/heic",
          "image/heif",
          "application/pdf",
        ],
        maximumSizeInBytes: 20 * 1024 * 1024,
        addRandomSuffix: false,
      }),
      // Not used: the browser hands the pathname straight to the server action,
      // so we don't rely on Blob's completion webhook (which can't reach localhost).
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(jsonResponse)
  } catch (e) {
    console.error("[v0] invoice blob-upload token error:", e)
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 })
  }
}
