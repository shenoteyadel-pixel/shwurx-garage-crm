import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getVapidKeys, sendPushToUsers } from "@/lib/push"

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { publicKey } = await getVapidKeys()
  return NextResponse.json({ publicKey })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const endpoint = body?.endpoint
  const p256dh = body?.keys?.p256dh
  const auth = body?.keys?.auth
  if (
    typeof endpoint !== "string" ||
    !endpoint.startsWith("https://") ||
    typeof p256dh !== "string" ||
    typeof auth !== "string"
  ) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 })
  }

  // The same browser endpoint may previously belong to another staff login on a shared device.
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint)
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    },
    { onConflict: "endpoint" },
  )
  if (error) {
    console.log("[v0] push subscribe failed:", error.message)
    return NextResponse.json({ error: "Could not save subscription" }, { status: 500 })
  }

  if (body?.test) {
    await sendPushToUsers([user.id], {
      title: "Notifications are on",
      body: "You will get CRM alerts on this device.",
      link: "/crm",
    })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (typeof body?.endpoint !== "string") return NextResponse.json({ error: "Missing endpoint" }, { status: 400 })
  await supabase.from("push_subscriptions").delete().eq("endpoint", body.endpoint).eq("user_id", user.id)
  return NextResponse.json({ ok: true })
}
