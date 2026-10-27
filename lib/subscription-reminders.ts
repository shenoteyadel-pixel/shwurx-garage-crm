import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { notifyUsers } from "@/lib/attendance-notify"
import { sendEmail } from "@/lib/email"
import { sendWhatsAppAlert, whatsAppConfigured } from "@/lib/whatsapp-send"
import { writeAudit } from "@/lib/rbac/context"
import { staffWithPermission, staffByIds, alertEmailHtml, type StaffContact } from "@/lib/subscription-notify"
import {
  MAX_REMINDER_ATTEMPTS,
  dubaiToday,
  grossCycleAED,
  reminderStage,
  type ReminderStage,
  type SubscriptionLike,
} from "@/lib/subscriptions"

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://swurxauto.com"
type Channel = "in_app" | "email" | "whatsapp"

interface SubRow extends SubscriptionLike {
  id: string
  service_name: string
  vendor: string | null
  owner_id: string | null
}

const fmtMoney = (n: number, cur: string) => `${cur} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function reminderMessage(sub: SubRow, stage: ReminderStage) {
  const when =
    stage.daysUntil > 0
      ? `renews in ${stage.daysUntil} day${stage.daysUntil === 1 ? "" : "s"}`
      : stage.daysUntil === 0
        ? "is due today"
        : `is ${-stage.daysUntil} day${stage.daysUntil === -1 ? "" : "s"} overdue`
  const title = `${stage.escalated ? "ESCALATED: " : ""}${sub.service_name} ${when}`
  const amount = fmtMoney(sub.amount, sub.currency)
  const aed = sub.currency === "AED" ? "" : ` (about ${fmtMoney(grossCycleAED(sub), "AED")} incl. VAT)`
  const body = `${amount}${aed} due ${sub.next_due_date}. Criticality: ${sub.criticality}. Renew it and record the payment, or resolve it in the CRM.`
  return { title, body, link: `/finance/subscriptions/${sub.id}` }
}

/** Channels per stage: early reminders stay in-app + email; WhatsApp from 7 days out and on escalation. */
function channelsFor(stage: ReminderStage): Channel[] {
  const late = stage.daysUntil <= 7 || stage.escalated
  return late ? ["in_app", "email", "whatsapp"] : ["in_app", "email"]
}

async function deliver(channel: Channel, to: StaffContact, msg: ReturnType<typeof reminderMessage>, idem: string) {
  if (channel === "in_app") {
    await notifyUsers([to.id], { title: msg.title, body: msg.body, type: "subscription", link: msg.link })
    return { sent: true as const }
  }
  if (channel === "email") {
    if (!to.email) return { sent: false, skipped: true, error: "no_email" }
    const res = await sendEmail({
      to: to.email,
      subject: msg.title,
      html: alertEmailHtml({
        title: msg.title,
        lines: [msg.body],
        ctaLabel: "Open subscription",
        ctaUrl: `${SITE}${msg.link}`,
        tone: msg.title.startsWith("ESCALATED") ? "danger" : "warn",
      }),
      idempotencyKey: idem,
    })
    return res.sent ? res : { ...res, skipped: res.error === "email_not_configured" }
  }
  if (!whatsAppConfigured()) return { sent: false, skipped: true, error: "whatsapp_not_configured" }
  if (!to.phone) return { sent: false, skipped: true, error: "no_phone" }
  return sendWhatsAppAlert(to.phone, `${msg.title}. ${msg.body} ${SITE}${msg.link}`)
}

export interface ReminderRunResult {
  runId: string | null
  checked: number
  due: number
  sent: number
  failed: number
  skipped: number
  retried: number
}

export async function runSubscriptionReminders(now: Date = new Date()): Promise<ReminderRunResult> {
  const svc = createServiceClient()
  const today = dubaiToday(now)
  const { data: run } = await svc.from("scheduled_job_runs").insert({ job: "subscription-reminders" }).select("id").single()
  const result: ReminderRunResult = { runId: run?.id ?? null, checked: 0, due: 0, sent: 0, failed: 0, skipped: 0, retried: 0 }

  try {
    const { data: subs, error } = await svc
      .from("subscriptions")
      .select(
        "id, service_name, vendor, owner_id, amount, currency, fx_rate_to_aed, vat_rate, amount_includes_vat, billing_cycle, custom_cycle_days, next_due_date, status, criticality, resolved_due_date",
      )
      .in("status", ["active", "pending_verification"])
    if (error) throw new Error(error.message)

    const managers = await staffWithPermission("subscriptions.manage")
    const assigned = await staffByIds((subs ?? []).map((s) => s.owner_id as string))
    const byId = new Map([...managers, ...assigned].map((s) => [s.id, s]))

    for (const raw of subs ?? []) {
      const sub = { ...raw, amount: Number(raw.amount), fx_rate_to_aed: Number(raw.fx_rate_to_aed), vat_rate: Number(raw.vat_rate) } as SubRow
      result.checked++
      const stage = reminderStage(sub, today)
      if (!stage) continue
      result.due++
      const msg = reminderMessage(sub, stage)
      const recipients = new Map(managers.map((m) => [m.id, m]))
      if (sub.owner_id && byId.has(sub.owner_id)) recipients.set(sub.owner_id, byId.get(sub.owner_id)!)

      for (const person of recipients.values()) {
        for (const channel of channelsFor(stage)) {
          const recipientKey = `${channel}:${person.id}`
          const { data: claimed } = await svc
            .from("subscription_reminders")
            .upsert(
              {
                subscription_id: sub.id,
                due_date: sub.next_due_date,
                stage: stage.stage,
                escalated: stage.escalated,
                channel,
                recipient_id: person.id,
                recipient_key: recipientKey,
                status: "failed",
                attempts: 0,
                last_error: "in_progress",
              },
              { onConflict: "subscription_id,due_date,stage,channel,recipient_key", ignoreDuplicates: true },
            )
            .select("id")
          const rowId = claimed?.[0]?.id as string | undefined
          if (!rowId) continue

          const res = await deliver(channel, person, msg, `sub-${sub.id}-${sub.next_due_date}-${stage.stage}-${recipientKey}`)
          const status = res.sent ? "sent" : "skipped" in res && res.skipped ? "skipped" : "failed"
          result[status === "sent" ? "sent" : status === "skipped" ? "skipped" : "failed"]++
          await svc
            .from("subscription_reminders")
            .update({ status, attempts: 1, last_error: res.sent ? null : (res.error ?? "unknown"), sent_at: res.sent ? new Date().toISOString() : null })
            .eq("id", rowId)
        }
      }
    }

    result.retried = await retryFailed(byId)
    await svc
      .from("scheduled_job_runs")
      .update({ status: result.failed ? "partial" : "ok", finished_at: new Date().toISOString(), detail: result })
      .eq("id", result.runId)
  } catch (e) {
    await svc
      .from("scheduled_job_runs")
      .update({ status: "failed", finished_at: new Date().toISOString(), detail: { ...result, error: (e as Error).message } })
      .eq("id", result.runId)
    await writeAudit({ action: "subscription_reminders_failed", resourceType: "scheduled_job", resourceId: result.runId, detail: { error: (e as Error).message }, status: "error" })
    throw e
  }

  await writeAudit({ action: "subscription_reminders_run", resourceType: "scheduled_job", resourceId: result.runId, detail: { ...result } })
  return result
}

/** Retries failed deliveries from the last 7 days, up to MAX_REMINDER_ATTEMPTS each. */
async function retryFailed(people: Map<string, StaffContact>): Promise<number> {
  const svc = createServiceClient()
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const { data: rows } = await svc
    .from("subscription_reminders")
    .select("id, subscription_id, stage, escalated, channel, recipient_id, recipient_key, attempts, due_date")
    .eq("status", "failed")
    .gte("attempts", 1)
    .lt("attempts", MAX_REMINDER_ATTEMPTS)
    .gte("created_at", since)
    .limit(200)
  let retried = 0
  for (const r of rows ?? []) {
    const person = people.get(r.recipient_id as string) ?? (await staffByIds([r.recipient_id as string]))[0]
    if (!person) continue
    const { data: sub } = await svc
      .from("subscriptions")
      .select("id, service_name, vendor, owner_id, amount, currency, fx_rate_to_aed, vat_rate, amount_includes_vat, billing_cycle, custom_cycle_days, next_due_date, status, criticality, resolved_due_date")
      .eq("id", r.subscription_id)
      .maybeSingle()
    if (!sub || sub.next_due_date !== r.due_date || !["active", "pending_verification"].includes(sub.status as string)) continue
    const row = { ...sub, amount: Number(sub.amount), fx_rate_to_aed: Number(sub.fx_rate_to_aed), vat_rate: Number(sub.vat_rate) } as SubRow
    const stage = reminderStage(row, dubaiToday()) ?? { stage: r.stage as string, escalated: r.escalated as boolean, daysUntil: 0 }
    const res = await deliver(r.channel as Channel, person, reminderMessage(row, stage), `sub-${row.id}-${r.due_date}-${r.stage}-${r.recipient_key}`)
    retried++
    await svc
      .from("subscription_reminders")
      .update({
        status: res.sent ? "sent" : "failed",
        attempts: (r.attempts as number) + 1,
        last_error: res.sent ? null : (res.error ?? "unknown"),
        sent_at: res.sent ? new Date().toISOString() : null,
      })
      .eq("id", r.id)
  }
  return retried
}
