import "server-only"
import webpush from "web-push"
import { createServiceClient } from "@/lib/supabase/server"

type VapidKeys = { publicKey: string; privateKey: string }

let cached: VapidKeys | null = null

/**
 * VAPID keys sign every push message. Env vars win if set; otherwise the keys
 * are generated once and persisted in the server-only app_secrets table so
 * every deployment and instance signs with the same pair.
 */
export async function getVapidKeys(): Promise<VapidKeys> {
  if (cached) return cached
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    cached = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
    return cached
  }

  const svc = createServiceClient()
  const { data } = await svc.from("app_secrets").select("key, value").in("key", ["vapid_public", "vapid_private"])
  const pub = data?.find((r) => r.key === "vapid_public")?.value
  const priv = data?.find((r) => r.key === "vapid_private")?.value
  if (pub && priv) {
    cached = { publicKey: pub, privateKey: priv }
    return cached
  }

  const generated = webpush.generateVAPIDKeys()
  // ignoreDuplicates: if two instances race, the first write wins and we re-read it.
  await svc.from("app_secrets").upsert(
    [
      { key: "vapid_public", value: generated.publicKey },
      { key: "vapid_private", value: generated.privateKey },
    ],
    { onConflict: "key", ignoreDuplicates: true },
  )
  const { data: stored } = await svc.from("app_secrets").select("key, value").in("key", ["vapid_public", "vapid_private"])
  cached = {
    publicKey: stored?.find((r) => r.key === "vapid_public")?.value ?? generated.publicKey,
    privateKey: stored?.find((r) => r.key === "vapid_private")?.value ?? generated.privateKey,
  }
  return cached
}

export type PushPayload = { title: string; body?: string | null; link?: string | null; type?: string }

/** Deliver a push to every registered device of the given users. Never throws. */
export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  if (!userIds.length) return
  try {
    const svc = createServiceClient()
    const { data: subs } = await svc
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("user_id", userIds)
    if (!subs?.length) return

    const keys = await getVapidKeys()
    webpush.setVapidDetails("mailto:wurxgarage@gmail.com", keys.publicKey, keys.privateKey)

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body ?? "",
      url: payload.link ?? "/crm",
      tag: payload.type ?? "info",
    })

    const expired: string[] = []
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
            TTL: 60 * 60 * 24,
            urgency: "high",
          })
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode
          if (code === 404 || code === 410) expired.push(s.id)
          else console.log("[v0] push send failed:", code, (err as Error).message)
        }
      }),
    )
    if (expired.length) await svc.from("push_subscriptions").delete().in("id", expired)
  } catch (err) {
    console.log("[v0] push fan-out failed:", (err as Error).message)
  }
}
