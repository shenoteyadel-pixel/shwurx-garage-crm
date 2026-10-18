import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { sendPushToUsers } from "@/lib/push"

type Payload = { title: string; body?: string; type?: string; link?: string }

/** Owners plus every active user whose role can view all staff attendance. */
export async function attendanceManagerIds(excludeUserId?: string): Promise<string[]> {
  const svc = createServiceClient()
  const { data: roleRows } = await svc
    .from("role_permissions")
    .select("role")
    .in("permission", ["attendance.view_all", "attendance.manage"])
    .eq("allowed", true)
  const roles = Array.from(new Set(["owner", ...(roleRows ?? []).map((r) => r.role as string)]))
  const { data: users } = await svc.from("profiles").select("id").in("role", roles).eq("is_active", true)
  return (users ?? []).map((u) => u.id as string).filter((id) => id !== excludeUserId)
}

export async function notifyUsers(userIds: string[], payload: Payload) {
  const ids = Array.from(new Set(userIds))
  if (!ids.length) return
  const svc = createServiceClient()
  await svc.from("notifications").insert(
    ids.map((id) => ({
      user_id: id,
      title: payload.title,
      body: payload.body ?? null,
      type: payload.type ?? "info",
      link: payload.link ?? null,
    })),
  )
  await sendPushToUsers(ids, payload)
}

export async function notifyAttendanceManagers(payload: Payload, excludeUserId?: string) {
  try {
    await notifyUsers(await attendanceManagerIds(excludeUserId), payload)
  } catch (e) {
    console.log("[v0] attendance notify failed:", (e as Error).message)
  }
}
