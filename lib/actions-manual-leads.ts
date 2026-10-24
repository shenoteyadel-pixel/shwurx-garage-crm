"use server"

import { createHash } from "node:crypto"
import { revalidatePath } from "next/cache"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getSessionContext, logAction } from "@/lib/rbac/context"
import { intakeIsDryRun } from "@/lib/website/intake-guard"
import { validateManualLead, manualLeadStatus, manualLeadNote, type ManualLeadResult } from "@/lib/manual-lead"

/** Authenticated CRM intake only. No public intake route, advertising tag or customer message. */
export async function createManualLead(raw: unknown): Promise<ManualLeadResult> {
  const ctx = await getSessionContext()
  if (!ctx) return { ok: false, error: "unauthorized" }
  if (!ctx.isActive || !ctx.isStaff || !ctx.permissions.has("leads.manage")) return { ok: false, error: "forbidden" }
  const validated = validateManualLead(raw)
  if (!validated.ok) return { ok: false, error: "invalid", fields: validated.fields }
  const i = validated.value
  if (await intakeIsDryRun()) return { ok: true, outcome: "dry_run", id: null }
  // Deterministic request ID uses the existing leads primary key for atomic retry/race safety.
  // A different employee cannot choose an ID belonging to another employee's submission.
  const h = createHash("sha256").update(`manual-lead:v1:${ctx.userId}:${i.submissionId}`).digest("hex")
  const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
  const fingerprint = createHash("sha256").update(JSON.stringify(i)).digest("hex")
  try {
    const db = await createClient()
    const prior = async (): Promise<ManualLeadResult | null> => {
      const { data, error } = await db.from("leads").select("id, metadata").eq("id", id).maybeSingle()
      if (error) return { ok: false, error: "unavailable" }
      if (!data) return null
      return data.metadata?.manual_submission_id === i.submissionId && data.metadata?.recorded_by === ctx.userId && data.metadata?.manual_fingerprint === fingerprint
        ? { ok: true, outcome: "duplicate", id } : { ok: false, error: "conflict" }
    }
    const old = await prior()
    if (old) return old
    const digits = i.phone.slice(1)
    const phoneFilters = [`phone.eq.${i.phone}`, `phone.eq.${digits}`, `phone.eq.00${digits}`, `metadata->>phone_digits.eq.${digits}`]
    if (/^9715\d{8}$/.test(digits)) phoneFilters.push(`phone.eq.0${digits.slice(3)}`)
    const { data: existing, error: matchError } = await db.from("leads").select("id")
      .in("status", ["new", "contacted", "qualified"]).is("metadata->>deleted_at", null)
      .or(phoneFilters.join(",")).limit(1).maybeSingle()
    if (matchError) return { ok: false, error: "unavailable" }
    if (existing) return { ok: false, error: "existing_contact", existingId: existing.id }
    const now = new Date().toISOString()
    // Existing server credential, constructed only after staff authorization,
    // validation, preview isolation and authenticated duplicate reads above.
    const { error } = await createServiceClient().from("leads").insert({
      id, name: i.name, phone: i.phone, email: null,
      message: i.fault || null, service_interest: [i.make, i.fault].filter(Boolean).join(" · ").slice(0, 160) || null,
      source: `manual_${i.channel}`, status: manualLeadStatus(i), customer_id: null,
      metadata: {
        kind: "manual_contact", recorded_by: ctx.userId, recorded_at: now,
        manual_revision: 0,
        manual_initial: { vehicle_make: i.make, vehicle_model: i.model, vehicle_year: i.year, fault: i.fault, contact_channel: i.channel, contact_result: i.contactResult, follow_up_result: i.followUpResult, occurred_at: i.occurredAt },
        manual_submission_id: i.submissionId, manual_fingerprint: fingerprint,
        phone_digits: digits, contact_channel: i.channel, contact_result: i.contactResult,
        contact_occurred_at: i.occurredAt, contact_evidence: i.evidence, follow_up_result: i.followUpResult,
        qualification: i.qualification || null, next_action: i.nextAction || null,
        qualification_evidence: i.followUpResult === "qualified" ? { result: i.contactResult, occurred_at: i.occurredAt, reason: i.qualification } : null,
        vehicle_make: i.make || null, vehicle_model: i.model || null, vehicle_year: i.year,
        vehicle: [i.make, i.model, i.year].filter(Boolean).join(" "), fault: i.fault || null,
        reported_source: i.reportedSource, reported_source_detail: i.sourceDetail || null, attribution_kind: "self_reported",
        notes: [{ at: now, by: ctx.name, text: manualLeadNote(i) }],
      },
    })
    if (error) {
      if (error.code === "23505") return await prior() ?? { ok: false, error: "unavailable" }
      return { ok: false, error: "unavailable" }
    }
    // Audit metadata deliberately contains no customer name, phone, fault or message.
    await logAction(ctx, "lead.manual_create", "lead", id, { channel: i.channel })
    revalidatePath("/leads")
    return { ok: true, outcome: "created", id }
  } catch {
    return { ok: false, error: "unavailable" }
  }
}

/** Evidence-backed follow-up; original intake/source remain unchanged. */
export async function recordManualLeadFollowUp(id: string, raw: unknown): Promise<ManualLeadResult> {
  const ctx = await getSessionContext()
  if (!ctx) return { ok: false, error: "unauthorized" }
  if (!ctx.isActive || !ctx.isStaff || !ctx.permissions.has("leads.manage")) return { ok: false, error: "forbidden" }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "invalid" }
  const validated = validateManualLead(raw)
  if (!validated.ok) return { ok: false, error: "invalid", fields: validated.fields }
  const i = validated.value
  if (await intakeIsDryRun()) return { ok: true, outcome: "dry_run", id: null }
  try {
    const db = await createClient()
    const { data: lead, error } = await db.from("leads").select("id, name, phone, source, status, customer_id, metadata").eq("id", id).maybeSingle()
    if (error) return { ok: false, error: "unavailable" }
    if (!lead || !["manual_whatsapp", "manual_phone"].includes(lead.source) || lead.metadata?.kind !== "manual_contact" || lead.metadata.deleted_at || lead.customer_id || lead.status === "converted") return { ok: false, error: "conflict" }
    const md = lead.metadata as Record<string, unknown>
    // Identity and acquisition claims belong to the original intake, not a later follow-up.
    if (i.name !== lead.name || i.phone !== lead.phone || i.reportedSource !== md.reported_source || i.sourceDetail !== (md.reported_source_detail ?? "")) return { ok: false, error: "conflict" }
    const fingerprint = createHash("sha256").update(JSON.stringify(i)).digest("hex")
    const history = Array.isArray(md.manual_followup_history) ? md.manual_followup_history as Record<string, unknown>[] : []
    const replay = history.find(h => h.submission_id === i.submissionId && h.by_id === ctx.userId)
    if (replay) return replay.fingerprint === fingerprint ? { ok: true, outcome: "duplicate", id } : { ok: false, error: "conflict" }
    if (typeof md.contact_occurred_at === "string" && Date.parse(i.occurredAt) < Date.parse(md.contact_occurred_at)) return { ok: false, error: "invalid", fields: { occurredAt: "before_latest_contact" } }
    if (lead.status === "qualified" && !["qualified", "not_suitable"].includes(i.followUpResult) && (i.make !== (md.vehicle_make ?? "") || i.model !== (md.vehicle_model ?? "") || i.year !== (md.vehicle_year ?? null) || i.fault !== (md.fault ?? ""))) return { ok: false, error: "invalid", fields: { qualification: "reassess_changed_vehicle_or_fault" } }
    if (history.length >= 500) return { ok: false, error: "unavailable" }
    const revision = typeof md.manual_revision === "number" ? md.manual_revision : 0
    const at = new Date().toISOString()
    const note = manualLeadNote(i)
    const notes = Array.isArray(md.notes) ? md.notes : []
    const metadata = {
      ...md, manual_revision: revision + 1,
      contact_channel: i.channel, contact_result: i.contactResult, contact_occurred_at: i.occurredAt,
      contact_evidence: i.evidence, follow_up_result: i.followUpResult,
      qualification: i.qualification || md.qualification || null, next_action: i.nextAction || null,
      qualification_evidence: i.followUpResult === "qualified" ? { result: i.contactResult, occurred_at: i.occurredAt, reason: i.qualification } : md.qualification_evidence ?? null,
      vehicle_make: i.make || null, vehicle_model: i.model || null, vehicle_year: i.year,
      vehicle: [i.make, i.model, i.year].filter(Boolean).join(" "), fault: i.fault || null,
      notes: [...notes, { at, by: ctx.name, text: note }],
      manual_followup_history: [...history, { submission_id: i.submissionId, fingerprint, at, by_id: ctx.userId, by: ctx.name, contact_channel: i.channel, contact_result: i.contactResult, follow_up_result: i.followUpResult, occurred_at: i.occurredAt, evidence: i.evidence, qualification: i.qualification, next_action: i.nextAction, vehicle_make: i.make, vehicle_model: i.model, vehicle_year: i.year, fault: i.fault }],
    }
    // Compare-and-swap: concurrent staff updates cannot silently drop a note/history entry.
    const candidate = manualLeadStatus(i)
    // A later missed call/unanswered message does not erase earlier contact or qualification.
    const status = candidate === "lost" || candidate === "qualified" ? candidate
      : lead.status === "qualified" ? "qualified"
        : lead.status === "contacted" && candidate === "new" ? "contacted"
          : lead.status === "lost" && candidate === "new" ? "lost" : candidate
    const { data: saved, error: saveError } = await db.from("leads").update({ metadata, status, message: i.fault || null, service_interest: [i.make, i.fault].filter(Boolean).join(" · ").slice(0, 160) || null, updated_at: at })
      .eq("id", id).eq("metadata->>manual_revision", String(revision)).eq("status", lead.status).is("customer_id", null).is("metadata->>deleted_at", null).neq("status", "converted").select("id").maybeSingle()
    if (saveError) return { ok: false, error: "unavailable" }
    if (!saved) return { ok: false, error: "conflict" }
    await logAction(ctx, "lead.manual_followup", "lead", id, { channel: i.channel })
    revalidatePath("/leads")
    return { ok: true, outcome: "created", id }
  } catch { return { ok: false, error: "unavailable" } }
}
