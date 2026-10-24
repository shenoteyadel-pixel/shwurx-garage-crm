import { normalizePhone, toLatinDigits, validatePhone } from "@/lib/website/intake-validate"

export const MANUAL_CHANNELS = ["whatsapp", "phone"] as const
export const REPORTED_SOURCES = ["unknown", "google_search", "google_ads", "facebook", "instagram", "referral", "returning_customer", "other"] as const
export const CONTACT_RESULTS = ["received", "missed", "answered", "conversation"] as const
export const FOLLOW_UP_RESULTS = ["pending", "follow_up", "qualified", "not_suitable"] as const
export type ManualLeadInput = {
  submissionId: string; name: string; phone: string; channel: typeof MANUAL_CHANNELS[number]
  make: string; model: string; year: number | null; fault: string
  reportedSource: typeof REPORTED_SOURCES[number]; sourceDetail: string
  contactResult: typeof CONTACT_RESULTS[number]; followUpResult: typeof FOLLOW_UP_RESULTS[number]
  occurredAt: string; evidence: string; qualification: string; nextAction: string
}
export type ManualLeadResult =
  | { ok: true; outcome: "created" | "duplicate" | "dry_run"; id: string | null }
  | { ok: false; error: "unauthorized" | "forbidden" | "invalid" | "unavailable" | "conflict" | "existing_contact"; fields?: Record<string, string>; existingId?: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const isManualLeadSource = (source: string | null | undefined) => source === "manual_whatsapp" || source === "manual_phone"
export const manualSourceLabel = (source: string | null | undefined, ar = false) => source === "manual_whatsapp"
  ? ar ? "واتساب — تسجيل موظف" : "WhatsApp — staff entry"
  : source === "manual_phone" ? ar ? "هاتف — تسجيل موظف" : "Phone — staff entry" : source ?? ""

/** Manual reports never accept paid click IDs, UTM metadata, status or customer IDs. */
export function validateManualLead(raw: unknown, now = new Date()): { ok: true; value: ManualLeadInput } | { ok: false; fields: Record<string, string> } {
  const b = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const fields: Record<string, string> = {}
  const text = (key: string, max: number, min = 0) => {
    const v = typeof b[key] === "string" ? (b[key] as string).trim() : ""
    if (v.length < min || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) fields[key] = "invalid"
    return v
  }
  const choice = <T extends string>(key: string, values: readonly T[]): T => {
    const v = b[key]
    if (typeof v !== "string" || !values.includes(v as T)) fields[key] = "invalid"
    return v as T
  }
  const submissionId = text("submissionId", 36)
  if (!UUID.test(submissionId)) fields.submissionId = "invalid"
  const name = text("name", 160, 2)
  const p = validatePhone(b.phone, { required: true })
  if (!p.ok) fields.phone = "invalid"
  const channel = choice("channel", MANUAL_CHANNELS)
  const make = text("make", 80), model = text("model", 80), fault = text("fault", 1500)
  const y = typeof b.year === "number" ? String(b.year) : typeof b.year === "string" ? toLatinDigits(b.year.trim()) : ""
  const year = y ? Number(y) : null
  // Record unsuitable older vehicles too; intake evidence is not an advertising eligibility filter.
  if (y && (!/^\d{4}$/.test(y) || year! < 1900 || year! > now.getFullYear() + 1)) fields.year = "invalid"
  const reportedSource = choice("reportedSource", REPORTED_SOURCES), sourceDetail = text("sourceDetail", 200)
  const contactResult = choice("contactResult", CONTACT_RESULTS), followUpResult = choice("followUpResult", FOLLOW_UP_RESULTS)
  if (channel === "whatsapp" && !["received", "conversation"].includes(contactResult)) fields.contactResult = "invalid"
  if (channel === "phone" && !["missed", "answered"].includes(contactResult)) fields.contactResult = "invalid"
  const occurredAt = text("occurredAt", 35)
  const time = Date.parse(occurredAt)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(occurredAt) || !Number.isFinite(time) || time > now.getTime() + 5 * 60_000 || time < Date.UTC(2000, 0, 1)) fields.occurredAt = "invalid"
  const calendar = new Date(`${occurredAt.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== occurredAt.slice(0, 10) || !/T(?:[01]\d|2[0-3]):[0-5]\d/.test(occurredAt)) fields.occurredAt = "invalid"
  const evidence = text("evidence", 1000, 8), qualification = text("qualification", 1000), nextAction = text("nextAction", 500)
  const connected = contactResult === "answered" || contactResult === "conversation"
  if (followUpResult === "qualified" && (!connected || !make || !model || !year || fault.length < 5 || qualification.length < 10)) fields.qualification = "qualification_required"
  if (followUpResult === "not_suitable" && qualification.length < 5) fields.qualification = "reason_required"
  if (followUpResult === "follow_up" && nextAction.length < 5) fields.nextAction = "required"
  if (Object.keys(fields).length) return { ok: false, fields }
  return { ok: true, value: { submissionId: submissionId.toLowerCase(), name, phone: `+${normalizePhone(p.ok ? p.value! : "")}`, channel, make, model, year, fault, reportedSource, sourceDetail, contactResult, followUpResult, occurredAt: new Date(time).toISOString(), evidence, qualification, nextAction } }
}

export function manualLeadStatus(input: ManualLeadInput): "new" | "contacted" | "qualified" | "lost" {
  if (input.followUpResult === "qualified") return "qualified"
  if (input.followUpResult === "not_suitable") return "lost"
  return input.contactResult === "answered" || input.contactResult === "conversation" ? "contacted" : "new"
}

export function manualLeadNote(i: ManualLeadInput) {
  return [
    `Channel: ${i.channel}; contact result: ${i.contactResult}; occurred: ${i.occurredAt}`,
    `Evidence: ${i.evidence}`, `Follow-up: ${i.followUpResult}`,
    i.qualification && `Qualification: ${i.qualification}`, i.nextAction && `Next action: ${i.nextAction}`,
    `Source (self-reported, not verified ad attribution): ${i.reportedSource}${i.sourceDetail ? ` — ${i.sourceDetail}` : ""}`,
  ].filter(Boolean).join("\n")
}
