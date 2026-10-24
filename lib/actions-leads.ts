"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { requirePermission, logAction, type SessionContext } from "@/lib/rbac/context"
import { notifyByPermission } from "@/lib/actions-notifications"

import { LEAD_STATUSES, type LeadStatus } from "@/lib/lead-status"
import { isManualLeadSource } from "@/lib/manual-lead"

export type { LeadStatus }

export interface LeadNote {
  at: string
  by: string
  text: string
}

export interface LeadRow {
  id: string
  name: string
  phone: string | null
  email: string | null
  message: string | null
  service_interest: string | null
  source: string | null
  status: LeadStatus
  customer_id: string | null
  metadata: {
    assigned_to?: string | null
    assigned_name?: string | null
    notes?: LeadNote[]
    utm_source?: string | null
    utm_medium?: string | null
    utm_campaign?: string | null
    referrer?: string | null
    page_path?: string | null
    [k: string]: unknown
  } | null
  created_at: string
  updated_at: string | null
}

async function guard(perm: Parameters<typeof requirePermission>[0]): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>
  ctx: SessionContext
}> {
  const ctx = await requirePermission(perm)
  const supabase = await createClient()
  return { supabase, ctx }
}

/** Normalize a UAE-ish phone to comparable digits (last 9). */
function phoneKey(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/[^\d]/g, "")
  return digits.slice(-9)
}

async function readLead(supabase: Awaited<ReturnType<typeof createClient>>, id: string): Promise<LeadRow> {
  const { data, error } = await supabase.from("leads").select("*").eq("id", id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error("Lead not found")
  return data as LeadRow
}

/* ---------------- Status ---------------- */

export async function setLeadStatus(id: string, status: LeadStatus) {
  const { supabase, ctx } = await guard("leads.manage")
  if (!LEAD_STATUSES.includes(status)) throw new Error("Invalid lead status")
  const lead = await readLead(supabase, id)
  if (isManualLeadSource(lead.source) || lead.metadata?.kind === "manual_contact") throw new Error("Use Record follow-up to update a manual lead with evidence.")
  const { error } = await supabase
    .from("leads")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
  await logAction(ctx, "lead.set_status", "lead", id, { status })
  revalidatePath("/leads")
}

/* ---------------- Delete (owner only) ---------------- */

/**
 * Soft-deletes by stamping metadata.deleted_at. The row is kept so the unique
 * external_id stops the Meta/Google auto-sync from re-importing the lead.
 */
export async function deleteLead(id: string) {
  const { supabase, ctx } = await guard("leads.manage")
  if (ctx.role !== "owner") throw new Error("Only the owner can delete leads")
  const lead = await readLead(supabase, id)
  const now = new Date().toISOString()
  const manual = isManualLeadSource(lead.source)
  const revision = Number(lead.metadata?.manual_revision ?? 0)
  const query = supabase
    .from("leads")
    .update({
      metadata: { ...(lead.metadata ?? {}), deleted_at: now, deleted_by: ctx.userId, ...(manual ? { manual_revision: revision + 1 } : {}) },
      updated_at: now,
    })
    .eq("id", id)
  const { data, error } = await (manual ? query.eq("metadata->>manual_revision", String(revision)) : query).select("id").maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error("The lead changed. Reload before deleting it.")
  await logAction(ctx, "lead.delete", "lead", id, { name: lead.name, source: lead.source })
  revalidatePath("/leads")
}

/* ---------------- Assignment ---------------- */

export async function assignLead(id: string, userId: string | null) {
  const { supabase, ctx } = await guard("leads.manage")
  const lead = await readLead(supabase, id)

  let assignedName: string | null = null
  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle()
    assignedName = profile?.full_name || profile?.email || "Staff"
  }

  const manual = isManualLeadSource(lead.source)
  const revision = Number(lead.metadata?.manual_revision ?? 0)
  const metadata = { ...(lead.metadata ?? {}), assigned_to: userId, assigned_name: assignedName, ...(manual ? { manual_revision: revision + 1 } : {}) }
  const query = supabase
    .from("leads")
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq("id", id)
  const { data, error } = await (manual ? query.eq("metadata->>manual_revision", String(revision)) : query).select("id").maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error("The lead changed. Reload before assigning it.")
  await logAction(ctx, "lead.assign", "lead", id, { assigned_to: userId })
  revalidatePath("/leads")
}

/* ---------------- Follow-up notes ---------------- */

export async function addLeadNote(id: string, text: string) {
  const trimmed = text.trim()
  if (!trimmed) return
  const { supabase, ctx } = await guard("leads.manage")
  const lead = await readLead(supabase, id)
  if (isManualLeadSource(lead.source)) throw new Error("Use Record follow-up to append evidence to a manual lead.")
  const notes: LeadNote[] = Array.isArray(lead.metadata?.notes) ? lead.metadata!.notes! : []
  const nextNotes = [...notes, { at: new Date().toISOString(), by: ctx.name, text: trimmed }]
  const metadata = { ...(lead.metadata ?? {}), notes: nextNotes }
  const { error } = await supabase
    .from("leads")
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
  await logAction(ctx, "lead.add_note", "lead", id)
  revalidatePath("/leads")
}

/* ---------------- Duplicate customer check ---------------- */

export interface CustomerMatch {
  id: string
  full_name: string
  mobile: string | null
  email: string | null
  matchedOn: "phone" | "email"
}

/** Find an existing customer whose phone OR email matches the lead. */
export async function findCustomerForLead(id: string): Promise<CustomerMatch | null> {
  const { supabase } = await guard("leads.manage")
  const lead = await readLead(supabase, id)

  // Match by phone (trailing digits) first, then by email.
  const key = phoneKey(lead.phone)
  if (key.length >= 6) {
    const { data: rows } = await supabase
      .from("customers")
      .select("id, full_name, mobile, email")
      .ilike("mobile", `%${key}%`)
      .limit(5)
    const match = (rows ?? []).find((c) => phoneKey(c.mobile) === key)
    if (match) return { ...match, matchedOn: "phone" }
  }

  const email = (lead.email ?? "").trim().toLowerCase()
  if (email) {
    const { data: rows } = await supabase
      .from("customers")
      .select("id, full_name, mobile, email")
      .ilike("email", email)
      .limit(1)
    if (rows && rows[0]) return { ...rows[0], matchedOn: "email" }
  }

  return null
}

/* ---------------- Convert to customer ---------------- */

export interface ConvertLeadResult {
  customerId: string
}

/**
 * Turn a website lead into a real customer record.
 * - Reuses an existing customer when `useExistingCustomerId` is given,
 *   otherwise creates one from the lead's contact details.
 * - Links the lead (customer_id) and marks it converted so it leaves the
 *   active pipeline.
 */
export async function convertLeadToCustomer(
  id: string,
  opts: { useExistingCustomerId?: string | null } = {},
): Promise<ConvertLeadResult> {
  const { supabase, ctx } = await guard("leads.manage")
  const lead = await readLead(supabase, id)
  if (lead.customer_id) throw new Error("This lead has already been converted")
  const manual = isManualLeadSource(lead.source)
  const qualification = lead.metadata?.qualification_evidence as { result?: string; reason?: string } | null
  if (manual && (lead.status !== "qualified" || lead.metadata?.kind !== "manual_contact" || lead.metadata.deleted_at || !["answered", "conversation"].includes(String(qualification?.result)) || String(qualification?.reason ?? "").trim().length < 10)) {
    throw new Error("Record an evidence-backed qualified follow-up before creating a customer.")
  }

  let customerId = opts.useExistingCustomerId ?? null
  if (!customerId) {
    const { data: created, error: custErr } = await supabase
      .from("customers")
      .insert({
        full_name: (lead.name || "").trim() || "Website Lead",
        mobile: lead.phone || null,
        email: lead.email || null,
        created_by: ctx.userId,
      })
      .select("id")
      .single()
    if (custErr) throw new Error(custErr.message)
    customerId = created.id
  }
  if (!customerId) throw new Error("Could not resolve a customer for this lead")

  const revision = Number(lead.metadata?.manual_revision ?? 0)
  const linkQuery = supabase
    .from("leads")
    .update({ status: "converted", customer_id: customerId, updated_at: new Date().toISOString(), ...(manual ? { metadata: { ...lead.metadata, manual_revision: revision + 1 } } : {}) })
    .eq("id", id)
  const { data: linked, error: linkErr } = await (manual ? linkQuery.eq("metadata->>manual_revision", String(revision)).eq("status", "qualified").is("customer_id", null).is("metadata->>deleted_at", null) : linkQuery).select("id").maybeSingle()
  if (linkErr) throw new Error(linkErr.message)
  if (!linked) throw new Error("The lead changed. Reload and select the existing customer before retrying conversion.")

  await logAction(ctx, "lead.convert", "lead", id, { customer_id: customerId })

  try {
    await notifyByPermission("customers.view", {
      title: "Lead converted to customer",
      body: `${(lead.name || "Website lead").trim()}${lead.service_interest ? ` — ${lead.service_interest}` : ""}.`,
      type: "info",
      link: `/customers/${customerId}`,
    })
  } catch {
    /* best-effort */
  }

  revalidatePath("/leads")
  revalidatePath("/customers")
  return { customerId }
}
