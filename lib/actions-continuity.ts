"use server"

import { revalidatePath } from "next/cache"
import { createServiceClient } from "@/lib/supabase/server"
import { requireSession, ctxCan, writeAudit } from "@/lib/rbac/context"
import { runServiceChecks } from "@/lib/service-monitor"
import { runSubscriptionReminders } from "@/lib/subscription-reminders"

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function runChecksNow(): Promise<Result<{ checked: number; down: number }>> {
  const ctx = await requireSession()
  if (!ctx.isStaff || !ctxCan(ctx, "continuity.view")) return { ok: false, error: "You do not have permission to do this." }
  const res = await runServiceChecks()
  await writeAudit({ actorId: ctx.userId, actorName: ctx.name, actorRole: ctx.role, action: "service_checks_run_manual", resourceType: "service_monitor", detail: res })
  revalidatePath("/finance/continuity")
  return { ok: true, checked: res.checked, down: res.down }
}

export async function runRemindersNow(): Promise<Result<{ sent: number; failed: number; due: number }>> {
  const ctx = await requireSession()
  if (!ctx.isStaff || !ctxCan(ctx, "subscriptions.approve")) return { ok: false, error: "You do not have permission to do this." }
  try {
    const res = await runSubscriptionReminders()
    await writeAudit({ actorId: ctx.userId, actorName: ctx.name, actorRole: ctx.role, action: "subscription_reminders_run_manual", resourceType: "scheduled_job", resourceId: res.runId, detail: { ...res } })
    revalidatePath("/finance/continuity")
    revalidatePath("/finance/subscriptions")
    return { ok: true, sent: res.sent, failed: res.failed, due: res.due }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function saveMonitor(id: string | null, fd: FormData): Promise<Result> {
  const ctx = await requireSession()
  if (!ctx.isStaff || !ctxCan(ctx, "subscriptions.approve")) return { ok: false, error: "You do not have permission to do this." }
  const name = String(fd.get("name") ?? "").trim().slice(0, 120)
  const targetUrl = String(fd.get("target_url") ?? "").trim() || null
  const subscriptionId = String(fd.get("subscription_id") ?? "")
  const criticality = String(fd.get("criticality") ?? "high")
  const row = {
    name,
    criticality: ["critical", "high", "medium", "low"].includes(criticality) ? criticality : "high",
    subscription_id: UUID.test(subscriptionId) ? subscriptionId : null,
    escalation_contacts: String(fd.get("escalation_contacts") ?? "").trim().slice(0, 500) || null,
    recovery_instructions: String(fd.get("recovery_instructions") ?? "").trim().slice(0, 2000) || null,
    enabled: fd.get("enabled") !== "false",
  }
  if (!name) return { ok: false, error: "Give the monitor a name." }
  const svc = createServiceClient()
  if (!id) {
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) return { ok: false, error: "Enter the URL to check (https://...)." }
    const { error } = await svc.from("service_monitors").insert({ ...row, kind: "http", target_url: targetUrl })
    if (error) return { ok: false, error: error.message }
  } else {
    if (!UUID.test(id)) return { ok: false, error: "Invalid monitor." }
    const patch: Record<string, unknown> = { ...row }
    if (targetUrl) {
      if (!/^https?:\/\//i.test(targetUrl)) return { ok: false, error: "The URL must start with http:// or https://." }
      patch.target_url = targetUrl
    }
    const { error } = await svc.from("service_monitors").update(patch).eq("id", id)
    if (error) return { ok: false, error: error.message }
  }
  await writeAudit({ actorId: ctx.userId, actorName: ctx.name, actorRole: ctx.role, action: id ? "service_monitor_updated" : "service_monitor_created", resourceType: "service_monitor", resourceId: id, detail: { name, target: targetUrl } })
  revalidatePath("/finance/continuity")
  return { ok: true }
}
