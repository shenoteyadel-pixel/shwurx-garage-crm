import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Returns the current user's most recent notifications + unread count.
// RLS scopes rows to the authenticated user, so no manual filter is needed.
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ notifications: [], unread: 0 }, { status: 401 })

  const { data } = await supabase
    .from("notifications")
    .select("id, title, body, type, link, read, created_at")
    .order("created_at", { ascending: false })
    .limit(20)

  const notifications = data ?? []
  const unread = notifications.filter((n) => !n.read).length
  return NextResponse.json({ notifications, unread })
}
