import { type NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { createClient } from "@/lib/supabase/server"

const TECH_MEDIA_PREFIX = "technician-media/"

// Streams technician photos/videos. Access follows the database row-level
// security of the record that references the file, so only staff who can see
// the job (assigned technician, managers, advisor) can open it.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const pathname = request.nextUrl.searchParams.get("p") ?? ""
  if (!pathname.startsWith(TECH_MEDIA_PREFIX) || pathname.includes("..")) {
    return new NextResponse("Not found", { status: 404 })
  }
  const url = `/api/technician-media?p=${encodeURIComponent(pathname)}`

  const [{ data: photo }, { data: part }] = await Promise.all([
    supabase.from("vehicle_photos").select("id").eq("url", url).is("deleted_at", null).limit(1).maybeSingle(),
    supabase.from("parts_requests").select("id").eq("photo_url", url).limit(1).maybeSingle(),
  ])
  if (!photo && !part) return new NextResponse("Not found", { status: 404 })

  try {
    const result = await get(pathname, {
      access: "private",
      ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
    })
    if (!result) return new NextResponse("Not found", { status: 404 })
    if (result.statusCode === 304) {
      return new NextResponse(null, { status: 304, headers: { ETag: result.blob.etag, "Cache-Control": "private, no-cache" } })
    }
    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType,
        ETag: result.blob.etag,
        "Cache-Control": "private, no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    console.error("[v0] technician media error:", error)
    return NextResponse.json({ error: "Failed to serve file" }, { status: 500 })
  }
}
