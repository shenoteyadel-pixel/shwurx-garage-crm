import "server-only"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import type { Permission } from "@/lib/rbac/roles"
import { sendPushToUsers } from "@/lib/push"

type ActivityInput = {
  title: string
  body?: string
  link?: string
  type?: string
  /** Also alert every active user holding this permission (in addition to owners/GMs). */
  permission?: Permission
  /** Skip the in-app/push alert for the person who performed the action. Defaults to true. */
  skipActor?: boolean
  /** Known actor (skips the session lookup). Pass `null` for customer/system events. */
  actor?: { id: string; name: string } | null
}

type Detail = Record<string, unknown> | undefined

const str = (v: unknown) => (v === undefined || v === null || v === "" ? "" : String(v))
const aed = (v: unknown) => (str(v) ? `AED ${Number(v).toLocaleString("en-AE", { maximumFractionDigits: 2 })}` : "")

const STAGE_LABELS: Record<string, string> = {
  check_in: "Check-in",
  delivered: "Delivered",
}

/**
 * Audited actions that also alert owners / general managers on their phone.
 * Anything not listed here is still written to the audit log, just without a push.
 */
const AUDIT_ALERTS: Record<string, (d: Detail) => { title: string; body?: string }> = {
  "job.create": (d) => ({ title: "New job card created", body: str(d?.job_number) && `Job ${str(d?.job_number)}` }),
  "job.update_stage": (d) => {
    const s = str(d?.stage)
    return { title: "Job status changed", body: s && `Moved to ${STAGE_LABELS[s] ?? s.replace(/_/g, " ")}` }
  },
  "job.mark_paid": (d) => ({ title: "Job marked as paid", body: [aed(d?.amount), str(d?.method)].filter(Boolean).join(" · ") }),
  "job.assign": () => ({ title: "Job staff assigned" }),
  "job.delete": () => ({ title: "Job card deleted" }),
  "invoice.create": (d) => ({
    title: "Invoice created",
    body: [str(d?.invoice_number), aed(d?.total)].filter(Boolean).join(" · "),
  }),
  "payment.record": (d) => ({ title: "Payment received", body: aed(d?.amount) }),
  "invoice.cancel": () => ({ title: "Invoice cancelled" }),
  "supplier_invoice_captured": () => ({ title: "Purchase invoice uploaded", body: "Waiting for review" }),
  "supplier_invoice_confirmed": () => ({ title: "Purchase invoice confirmed", body: "Supplier and parts recorded" }),
  "supplier_invoice_deleted": () => ({ title: "Purchase invoice deleted" }),
  "supplier_invoice.payment": (d) => ({ title: "Supplier payment recorded", body: aed(d?.amount) }),
  "car_expense.add": (d) => ({ title: "Car expense added", body: [aed(d?.amount), str(d?.category)].filter(Boolean).join(" · ") }),
  "inspection_completed": () => ({ title: "Inspection completed" }),
  "diagnosis_confirmed": () => ({ title: "Diagnosis confirmed" }),
  "quotation.save": (d) => ({ title: "Quotation saved", body: aed(d?.total) }),
  "approval.sent": () => ({ title: "Approval sent to customer" }),
  "photos.upload": (d) => ({ title: "Photos uploaded", body: str(d?.count) && `${str(d?.count)} ${str(d?.kind)} photo(s)` }),
  "appointment.convert": () => ({ title: "Appointment converted to job" }),
  "appointment.assign_driver": () => ({ title: "Driver assigned to appointment" }),
  "lead.convert": () => ({ title: "Lead converted to customer" }),
  "vehicle.transfer": () => ({ title: "Vehicle ownership transferred" }),
  "user.update_role": () => ({ title: "Staff role changed" }),
  "user.force_logout": () => ({ title: "Staff member logged out" }),
  "user.login": () => ({ title: "Staff login" }),
}

function linkFor(resourceType?: string, resourceId?: string | null, detail?: Detail): string | undefined {
  const jobId = str(detail?.job_id)
  if (!resourceId) return jobId ? `/jobs/${jobId}` : undefined
  switch (resourceType) {
    case "job":
      return `/jobs/${resourceId}`
    case "invoice":
      return `/invoices/${resourceId}`
    case "supplier_invoice":
      return `/purchasing/invoices/${resourceId}`
    case "appointment":
      return jobId ? `/jobs/${jobId}` : "/appointments"
    case "lead":
      return "/leads"
    case "user":
      return "/users"
    default:
      return jobId ? `/jobs/${jobId}` : undefined
  }
}

/** Called by logAction: turns important audited actions into phone notifications. */
export async function notifyFromAudit(
  actor: { id: string; name: string },
  action: string,
  resourceType?: string,
  resourceId?: string | null,
  detail?: Detail,
) {
  const build = AUDIT_ALERTS[action]
  if (!build) return
  const { title, body } = build(detail)
  await notifyActivity({ title, body: body || undefined, link: linkFor(resourceType, resourceId, detail), actor })
}

async function currentActor(): Promise<{ id: string; name: string } | null> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null
    const svc = createServiceClient()
    const { data } = await svc.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
    return { id: user.id, name: data?.full_name || user.email || "A staff member" }
  } catch {
    return null
  }
}

/**
 * Records a CRM activity as an in-app notification + phone push for owners /
 * general managers (and optional permission holders). Never throws, so a
 * notification failure can't break the action that triggered it.
 */
export async function notifyActivity(input: ActivityInput) {
  try {
    const svc = createServiceClient()
    const actor = input.actor !== undefined ? input.actor : await currentActor()

    const recipients = new Set<string>()
    const { data: owners } = await svc
      .from("profiles")
      .select("id")
      .in("role", ["owner", "general_manager"])
      .eq("is_active", true)
    owners?.forEach((u) => recipients.add(u.id))

    if (input.permission) {
      const { data: roleRows } = await svc
        .from("role_permissions")
        .select("role")
        .eq("permission", input.permission)
        .eq("allowed", true)
      const roles = (roleRows ?? []).map((r) => r.role)
      if (roles.length) {
        const { data: users } = await svc.from("profiles").select("id").in("role", roles).eq("is_active", true)
        users?.forEach((u) => recipients.add(u.id))
      }
    }

    if (actor && input.skipActor !== false) recipients.delete(actor.id)
    const ids = [...recipients]
    if (!ids.length) return

    const body = [input.body, actor ? `By ${actor.name}` : null].filter(Boolean).join(" · ")
    const payload = { title: input.title, body, type: input.type ?? "activity", link: input.link }

    await svc.from("notifications").insert(
      ids.map((id) => ({
        user_id: id,
        title: payload.title,
        body: payload.body || null,
        type: payload.type,
        link: payload.link ?? null,
      })),
    )
    await sendPushToUsers(ids, payload)
  } catch (err) {
    console.error("notifyActivity failed", err)
  }
}
