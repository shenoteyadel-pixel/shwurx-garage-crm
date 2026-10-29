export const SUBSCRIPTION_CATEGORIES = [
  "hosting",
  "database",
  "domain_dns",
  "email_workspace",
  "messaging",
  "marketing",
  "ai_api",
  "ssl",
  "email_delivery",
  "backup",
  "software_license",
  "diagnostic_tool",
  "crm_integration",
  "other",
] as const
export type SubscriptionCategory = (typeof SUBSCRIPTION_CATEGORIES)[number]

export const BILLING_CYCLES = ["monthly", "quarterly", "yearly", "custom"] as const
export type BillingCycle = (typeof BILLING_CYCLES)[number]

export const CRITICALITY = ["critical", "high", "medium", "low"] as const
export type Criticality = (typeof CRITICALITY)[number]

export const SUBSCRIPTION_STATUSES = ["active", "pending_verification", "paused", "cancelled"] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

export const PAYMENT_METHODS = ["provider_portal", "bank_transfer", "hosted_checkout", "cash", "other"] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

/** Days before the due date at which a reminder fires. */
export const REMINDER_OFFSETS = [30, 14, 7, 3, 1] as const
/** Overdue reminders escalate to every owner on every channel after this many days. */
export const ESCALATE_AFTER_OVERDUE_DAYS = 3
export const MAX_REMINDER_ATTEMPTS = 5

export interface SubscriptionLike {
  amount: number
  currency: string
  fx_rate_to_aed: number
  vat_rate: number
  amount_includes_vat: boolean
  billing_cycle: BillingCycle
  custom_cycle_days: number | null
  next_due_date: string
  status: SubscriptionStatus
  criticality: Criticality
  resolved_due_date?: string | null
}

const DAY_MS = 86_400_000

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

/** Today's calendar date in Dubai (UTC+4, no DST). */
export function dubaiToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 4 * 3_600_000).toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

function addMonthsClamped(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, lastDay))
  return target.toISOString().slice(0, 10)
}

/** The next due date after a renewal for the given cycle. */
export function advanceDueDate(date: string, cycle: BillingCycle, customDays: number | null): string {
  switch (cycle) {
    case "monthly":
      return addMonthsClamped(date, 1)
    case "quarterly":
      return addMonthsClamped(date, 3)
    case "yearly":
      return addMonthsClamped(date, 12)
    case "custom":
      return addDays(date, Math.max(1, customDays ?? 30))
  }
}

export function cycleDays(cycle: BillingCycle, customDays: number | null): number {
  if (cycle === "monthly") return 365 / 12
  if (cycle === "quarterly") return 365 / 4
  if (cycle === "yearly") return 365
  return Math.max(1, customDays ?? 30)
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Gross per-cycle cost in AED, including VAT. */
export function grossCycleAED(s: Pick<SubscriptionLike, "amount" | "fx_rate_to_aed" | "vat_rate" | "amount_includes_vat">): number {
  const gross = s.amount_includes_vat ? s.amount : s.amount * (1 + s.vat_rate / 100)
  return round2(gross * s.fx_rate_to_aed)
}

export function monthlyCostAED(s: SubscriptionLike): number {
  return round2((grossCycleAED(s) * (365 / 12)) / cycleDays(s.billing_cycle, s.custom_cycle_days))
}

export function yearlyCostAED(s: SubscriptionLike): number {
  return round2((grossCycleAED(s) * 365) / cycleDays(s.billing_cycle, s.custom_cycle_days))
}

export function isTracked(s: Pick<SubscriptionLike, "status">): boolean {
  return s.status === "active" || s.status === "pending_verification"
}

export type DueState = "overdue" | "due_today" | "due_soon" | "upcoming" | "resolved" | "inactive"

export function dueState(s: SubscriptionLike, today: string, soonDays = 30): DueState {
  if (!isTracked(s)) return "inactive"
  if (s.resolved_due_date && s.resolved_due_date === s.next_due_date) return "resolved"
  const d = daysBetween(today, s.next_due_date)
  if (d < 0) return "overdue"
  if (d === 0) return "due_today"
  if (d <= soonDays) return "due_soon"
  return "upcoming"
}

export interface ReminderStage {
  stage: string
  escalated: boolean
  daysUntil: number
}

/**
 * Which reminder applies today. Before the due date we pick the nearest offset
 * the date has already crossed, so a missed cron run still sends a catch-up.
 * Overdue reminders get a per-day stage so they repeat daily until resolved.
 */
export function reminderStage(s: SubscriptionLike, today: string): ReminderStage | null {
  const state = dueState(s, today)
  if (state === "inactive" || state === "resolved") return null
  const daysUntil = daysBetween(today, s.next_due_date)
  if (daysUntil > REMINDER_OFFSETS[0]) return null
  if (daysUntil > 0) {
    const offset = [...REMINDER_OFFSETS].reverse().find((o) => daysUntil <= o)!
    return { stage: `d${offset}`, escalated: false, daysUntil }
  }
  if (daysUntil === 0) return { stage: "due", escalated: s.criticality === "critical", daysUntil }
  const overdueDays = -daysUntil
  const escalated = overdueDays >= ESCALATE_AFTER_OVERDUE_DAYS || s.criticality === "critical"
  return { stage: `overdue:${today}`, escalated, daysUntil }
}

/** Every due date for the subscription within [from, to]. */
export function occurrencesBetween(s: SubscriptionLike, from: string, to: string): string[] {
  if (!isTracked(s)) return []
  const out: string[] = []
  let d = s.next_due_date
  let guard = 0
  while (d <= to && guard++ < 400) {
    if (d >= from) out.push(d)
    d = advanceDueDate(d, s.billing_cycle, s.custom_cycle_days)
  }
  return out
}

/** Cash needed in AED for renewals falling inside the next `days` days (overdue included). */
export function cashRequirementAED(subs: SubscriptionLike[], today: string, days: number): number {
  const to = addDays(today, days)
  return round2(
    subs.reduce((sum, s) => {
      const overdue = isTracked(s) && s.next_due_date < today && dueState(s, today) === "overdue" ? 1 : 0
      return sum + (occurrencesBetween(s, today, to).length + overdue) * grossCycleAED(s)
    }, 0),
  )
}

const CARD_LIKE = /(?:\d[ -]?){13,19}/
const SENSITIVE_WORDS = /\b(cvv|cvc|cvv2|password|passcode|pin code)\b\s*[:=]/i

/** True when the text looks like it contains a card number, CVV or password. */
export function containsSensitiveData(text: string | null | undefined): boolean {
  if (!text) return false
  if (SENSITIVE_WORDS.test(text)) return true
  const match = text.match(CARD_LIKE)
  if (!match) return false
  return luhnValid(match[0].replace(/\D/g, ""))
}

function luhnValid(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i])
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}

/** Only https portals; never credentials embedded in the URL. */
export function validatePortalUrl(raw: string | null | undefined): { ok: true; url: string | null } | { ok: false; error: string } {
  const value = (raw ?? "").trim()
  if (!value) return { ok: true, url: null }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { ok: false, error: "Billing portal must be a full https:// address." }
  }
  if (url.protocol !== "https:") return { ok: false, error: "Billing portal must use https://." }
  if (url.username || url.password) return { ok: false, error: "Do not put usernames or passwords in the portal URL." }
  return { ok: true, url: url.toString() }
}

/** Official billing hosts for common vendors, used to warn about look-alike links. */
export const KNOWN_BILLING_HOSTS: Record<string, string[]> = {
  vercel: ["vercel.com"],
  supabase: ["supabase.com"],
  google: ["google.com", "admin.google.com", "payments.google.com", "ads.google.com"],
  "360dialog": ["360dialog.com", "hub.360dialog.com"],
  meta: ["facebook.com", "business.facebook.com"],
  openai: ["openai.com", "platform.openai.com"],
  anthropic: ["anthropic.com", "console.anthropic.com"],
  resend: ["resend.com"],
  godaddy: ["godaddy.com"],
  namecheap: ["namecheap.com"],
  cloudflare: ["cloudflare.com", "dash.cloudflare.com"],
  stripe: ["stripe.com", "dashboard.stripe.com"],
}

/** null = unknown vendor; true = host matches the vendor's official domain; false = mismatch. */
export function portalMatchesVendor(vendor: string | null | undefined, portal: string | null | undefined): boolean | null {
  if (!vendor || !portal) return null
  const key = Object.keys(KNOWN_BILLING_HOSTS).find((k) => vendor.toLowerCase().includes(k))
  if (!key) return null
  let host: string
  try {
    host = new URL(portal).hostname.toLowerCase()
  } catch {
    return false
  }
  return KNOWN_BILLING_HOSTS[key].some((h) => host === h || host.endsWith(`.${h}`))
}

// ---------------- CSV import ----------------

export interface SubscriptionInput {
  service_name: string
  category: SubscriptionCategory
  vendor: string | null
  account_reference: string | null
  service_url: string | null
  billing_portal_url: string | null
  billing_cycle: BillingCycle
  custom_cycle_days: number | null
  amount: number
  currency: string
  fx_rate_to_aed: number
  vat_rate: number
  amount_includes_vat: boolean
  next_due_date: string
  renewal_type: "auto" | "manual"
  auto_renew: boolean
  payment_method_label: string | null
  department: string | null
  criticality: Criticality
  notes: string | null
}

export const CSV_COLUMNS: (keyof SubscriptionInput)[] = [
  "service_name",
  "category",
  "vendor",
  "account_reference",
  "service_url",
  "billing_portal_url",
  "billing_cycle",
  "custom_cycle_days",
  "amount",
  "currency",
  "fx_rate_to_aed",
  "vat_rate",
  "amount_includes_vat",
  "next_due_date",
  "renewal_type",
  "auto_renew",
  "payment_method_label",
  "department",
  "criticality",
  "notes",
]

/** RFC-4180 style parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  const src = text.replace(/^\uFEFF/, "")
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
      continue
    }
    if (c === '"') quoted = true
    else if (c === ",") {
      row.push(field)
      field = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else field += c
  }
  if (field !== "" || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""))
}

const str = (v: unknown, max = 300): string | null => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim()
  return s ? s.slice(0, max) : null
}
const bool = (v: unknown) => ["true", "yes", "1", "y", "on"].includes(String(v ?? "").trim().toLowerCase())
const num = (v: unknown) => {
  const s = String(v ?? "").replace(/,/g, "").trim()
  return s === "" ? NaN : Number(s)
}

/** Validates and normalises one subscription record from a form or CSV row. */
export function normalizeSubscriptionInput(
  raw: Record<string, unknown>,
): { ok: true; value: SubscriptionInput } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const service_name = str(raw.service_name, 150)
  if (!service_name) errors.push("Service name is required.")

  const categoryRaw = (str(raw.category, 40) ?? "other").toLowerCase()
  const category = (SUBSCRIPTION_CATEGORIES as readonly string[]).includes(categoryRaw)
    ? (categoryRaw as SubscriptionCategory)
    : null
  if (!category) errors.push(`Unknown category "${categoryRaw}".`)

  const cycleRaw = (str(raw.billing_cycle, 20) ?? "monthly").toLowerCase()
  const billing_cycle = (BILLING_CYCLES as readonly string[]).includes(cycleRaw) ? (cycleRaw as BillingCycle) : null
  if (!billing_cycle) errors.push(`Unknown billing cycle "${cycleRaw}".`)

  const customDaysNum = num(raw.custom_cycle_days)
  const custom_cycle_days = Number.isFinite(customDaysNum) ? Math.round(customDaysNum) : null
  if (billing_cycle === "custom" && !(custom_cycle_days && custom_cycle_days >= 1 && custom_cycle_days <= 3660))
    errors.push("Custom cycles need a number of days between 1 and 3660.")

  const amount = num(raw.amount)
  if (!(amount >= 0) || amount > 10_000_000) errors.push("Amount must be a number of 0 or more.")

  const currency = (str(raw.currency, 3) ?? "AED").toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) errors.push("Currency must be a 3-letter code such as AED or USD.")

  const fxRaw = num(raw.fx_rate_to_aed)
  const fx_rate_to_aed = currency === "AED" ? 1 : fxRaw
  if (!(fx_rate_to_aed > 0)) errors.push(`Enter the exchange rate from ${currency} to AED.`)

  const vatRaw = num(raw.vat_rate)
  const vat_rate = Number.isFinite(vatRaw) ? vatRaw : 0
  if (!(vat_rate >= 0 && vat_rate <= 100)) errors.push("VAT rate must be between 0 and 100.")

  const next_due_date = str(raw.next_due_date, 10) ?? ""
  if (!isIsoDate(next_due_date)) errors.push("Next due date must be a date in YYYY-MM-DD format.")

  const renewalRaw = (str(raw.renewal_type, 10) ?? "manual").toLowerCase()
  const renewal_type = renewalRaw === "auto" ? "auto" : "manual"

  const critRaw = (str(raw.criticality, 10) ?? "medium").toLowerCase()
  const criticality = (CRITICALITY as readonly string[]).includes(critRaw) ? (critRaw as Criticality) : null
  if (!criticality) errors.push(`Unknown criticality "${critRaw}".`)

  const portal = validatePortalUrl(str(raw.billing_portal_url, 500))
  if (!portal.ok) errors.push(portal.error)

  const serviceUrl = str(raw.service_url, 500)
  if (serviceUrl && !/^https?:\/\//i.test(serviceUrl)) errors.push("Service URL must start with http:// or https://.")

  const payment_method_label = str(raw.payment_method_label, 80)
  const notes = str(raw.notes, 2000)
  const account_reference = str(raw.account_reference, 150)
  for (const [label, value] of [
    ["Payment method label", payment_method_label],
    ["Notes", notes],
    ["Account reference", account_reference],
  ] as const) {
    if (containsSensitiveData(value)) errors.push(`${label} looks like it contains a card number, CVV or password. Remove it.`)
  }

  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    value: {
      service_name: service_name!,
      category: category!,
      vendor: str(raw.vendor, 150),
      account_reference,
      service_url: serviceUrl,
      billing_portal_url: portal.ok ? portal.url : null,
      billing_cycle: billing_cycle!,
      custom_cycle_days: billing_cycle === "custom" ? custom_cycle_days : null,
      amount: round2(amount),
      currency,
      fx_rate_to_aed,
      vat_rate,
      amount_includes_vat: bool(raw.amount_includes_vat),
      next_due_date,
      renewal_type,
      auto_renew: bool(raw.auto_renew) || renewal_type === "auto",
      payment_method_label,
      department: str(raw.department, 80),
      criticality: criticality!,
      notes,
    },
  }
}

export interface CsvRowResult {
  line: number
  value?: SubscriptionInput
  errors?: string[]
}

export function parseSubscriptionCsv(text: string): { rows: CsvRowResult[]; headerError?: string } {
  const table = parseCsv(text)
  if (!table.length) return { rows: [], headerError: "The file is empty." }
  const header = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"))
  if (!header.includes("service_name") || !header.includes("next_due_date"))
    return { rows: [], headerError: "The header row must include at least service_name and next_due_date." }
  const rows = table.slice(1, 501).map((cells, i) => {
    const record: Record<string, string> = {}
    header.forEach((h, idx) => (record[h] = cells[idx] ?? ""))
    const res = normalizeSubscriptionInput(record)
    return res.ok ? { line: i + 2, value: res.value } : { line: i + 2, errors: res.errors }
  })
  return { rows }
}

export function csvTemplate(): string {
  return [
    CSV_COLUMNS.join(","),
    "Vercel Pro,hosting,Vercel,team-swurx,https://swurxauto.com,https://vercel.com/account/billing,monthly,,20,USD,3.6725,0,false,2026-11-15,auto,true,Company Visa (last 4: 1234),IT,critical,",
  ].join("\n")
}

// ---------------- Monitoring ----------------

export type IncidentCause = "outage" | "suspected_unpaid" | "stale" | "capacity"

/**
 * Separates "the provider is down" from "we probably did not pay": a failing
 * check whose linked subscription is overdue is flagged as suspected unpaid.
 */
export function classifyFailure(opts: {
  kind: string
  linkedSubscription?: SubscriptionLike | null
  today: string
}): IncidentCause {
  if (opts.kind === "backup" || opts.kind === "scheduled_job") return "stale"
  const sub = opts.linkedSubscription
  if (sub && dueState(sub, opts.today) === "overdue") return "suspected_unpaid"
  return "outage"
}
