"use server"

import { logCurrent } from "@/lib/rbac/context"

import { revalidatePath } from "next/cache"
import { generateObject } from "ai"
import { z } from "zod"
import { getShellUser } from "@/lib/shell-user"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export type TargetKind = "purchase" | "sales" | "technician"
const KINDS: TargetKind[] = ["purchase", "sales", "technician"]
const UUID = /^[0-9a-f-]{36}$/i
const TARGET_MODEL = "anthropic/claude-sonnet-5"
const HISTORY_MONTHS = 6

type Fail = { ok: false; error: string }

async function requireOwner(): Promise<Fail | null> {
  const user = await getShellUser()
  return user.role === "owner" ? null : { ok: false, error: "Only the owner can manage targets." }
}

function cleanAmount(amount: number) {
  const value = Math.round(Number(amount) * 100) / 100
  return Number.isFinite(value) && value >= 0 && value <= 100_000_000 ? value : null
}

async function currentUserId() {
  const { data } = await (await createClient()).auth.getUser()
  return data.user?.id ?? null
}

export async function saveStaffTarget(userId: string, kind: TargetKind, amount: number) {
  return saveStaffTargets([{ userId, kind, amount }])
}

export async function saveStaffTargets(items: { userId: string; kind: TargetKind; amount: number }[]) {
  const denied = await requireOwner()
  if (denied) return denied
  if (items.length === 0 || items.length > 200) return { ok: false as const, error: "Nothing to save." }

  const updatedBy = await currentUserId()
  const now = new Date().toISOString()
  const rows = []
  for (const i of items) {
    if (!KINDS.includes(i.kind)) return { ok: false as const, error: "Invalid target type." }
    if (!UUID.test(i.userId)) return { ok: false as const, error: "Invalid staff member." }
    const value = cleanAmount(i.amount)
    if (value === null) return { ok: false as const, error: "Enter a target between 0 and 100,000,000." }
    rows.push({ user_id: i.userId, kind: i.kind, monthly_target: value, updated_by: updatedBy, updated_at: now })
  }

  const { error } = await createServiceClient().from("staff_targets").upsert(rows, { onConflict: "user_id,kind" })
  if (error) return { ok: false as const, error: error.message }

  await logCurrent("targets.save", "user", null, { count: rows.length })
  revalidatePath("/reports/staff-targets")
  return { ok: true as const }
}

export async function removeStaffTarget(userId: string, kind: TargetKind) {
  const denied = await requireOwner()
  if (denied) return denied
  if (!KINDS.includes(kind) || !UUID.test(userId)) return { ok: false as const, error: "Invalid target." }

  const { error } = await createServiceClient().from("staff_targets").delete().eq("user_id", userId).eq("kind", kind)
  if (error) return { ok: false as const, error: error.message }

  await logCurrent("targets.remove", "user", userId, { kind })
  revalidatePath("/reports/staff-targets")
  return { ok: true as const }
}

export type TargetSuggestion = {
  target: number
  average: number
  reason: string
  history: { month: string; total: number }[]
}
export type SuggestionMap = Record<TargetKind, Record<string, TargetSuggestion>>

function previousMonths(month: string, count: number) {
  const [y, m] = month.split("-").map(Number)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(y, m - 1 - count + i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  })
}

const roundTarget = (n: number) => (n <= 0 ? 0 : Math.max(500, Math.round(n / 500) * 500))

function baseline(history: { total: number }[]) {
  const recent = history.slice(-3).map((h) => h.total)
  const active = history.filter((h) => h.total > 0)
  const recentAvg = recent.reduce((t, n) => t + n, 0) / (recent.length || 1)
  const average = active.reduce((t, h) => t + h.total, 0) / (active.length || 1)
  return { average: Math.round(average), target: roundTarget(Math.max(recentAvg, average) * 1.1) }
}

const aiSchema = z.object({
  suggestions: z.array(
    z.object({
      key: z.string().describe("The exact key given for the person, e.g. sales:<uuid>"),
      target: z.number().describe("Suggested monthly target in AED, rounded to the nearest 500"),
      reason: z.string().describe("One short sentence explaining the target, mentioning the trend"),
    }),
  ),
})

export async function suggestStaffTargets(month: string): Promise<{ ok: true; suggestions: SuggestionMap; ai: boolean } | Fail> {
  const denied = await requireOwner()
  if (denied) return denied
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: "Invalid month." }

  const months = previousMonths(month, HISTORY_MONTHS)
  const from = `${months[0]}-01`
  const until = `${month}-01`
  const svc = createServiceClient()

  const [purchasesRes, salesRes] = await Promise.all([
    svc
      .from("supplier_invoices")
      .select("created_by, total, invoice_date, created_at")
      .eq("status", "confirmed")
      .is("deleted_at", null)
      .or(`and(invoice_date.gte.${from},invoice_date.lt.${until}),and(invoice_date.is.null,created_at.gte.${from},created_at.lt.${until})`),
    svc
      .from("invoices")
      .select("total, issue_date, jobs(advisor_id, technician_id)")
      .neq("status", "cancelled")
      .gte("issue_date", from)
      .lt("issue_date", until),
  ])
  if (purchasesRes.error || salesRes.error) {
    return { ok: false, error: (purchasesRes.error ?? salesRes.error)!.message }
  }

  const buckets: Record<TargetKind, Map<string, Map<string, number>>> = {
    purchase: new Map(),
    sales: new Map(),
    technician: new Map(),
  }
  const put = (kind: TargetKind, id: string | null, date: string | null, amount: unknown) => {
    if (!id || !date) return
    const key = date.slice(0, 7)
    const person = buckets[kind].get(id) ?? new Map<string, number>()
    person.set(key, (person.get(key) ?? 0) + (Number(amount) || 0))
    buckets[kind].set(id, person)
  }
  for (const r of purchasesRes.data ?? []) put("purchase", r.created_by, r.invoice_date ?? r.created_at, r.total)
  for (const r of (salesRes.data ?? []) as unknown as {
    total: number | null
    issue_date: string | null
    jobs: { advisor_id: string | null; technician_id: string | null } | null
  }[]) {
    put("sales", r.jobs?.advisor_id ?? null, r.issue_date, r.total)
    put("technician", r.jobs?.technician_id ?? null, r.issue_date, r.total)
  }

  const suggestions: SuggestionMap = { purchase: {}, sales: {}, technician: {} }
  const promptLines: string[] = []
  for (const kind of KINDS) {
    for (const [id, byMonth] of buckets[kind]) {
      const history = months.map((mo) => ({ month: mo, total: Math.round(byMonth.get(mo) ?? 0) }))
      const base = baseline(history)
      suggestions[kind][id] = {
        ...base,
        history,
        reason: `Based on an average of ${base.average.toLocaleString("en-US")} AED in active months, plus 10% growth.`,
      }
      promptLines.push(`${kind}:${id} | ${history.map((h) => `${h.month}=${h.total}`).join(", ")} | baseline=${base.target}`)
    }
  }

  if (promptLines.length === 0) return { ok: true, suggestions, ai: false }

  try {
    const { object } = await generateObject({
      model: TARGET_MODEL,
      schema: aiSchema,
      prompt: [
        `You set fair, motivating monthly targets for staff at a car service workshop in the UAE (amounts in AED).`,
        `Target month: ${month}. Each line is: key | monthly totals for the previous ${HISTORY_MONTHS} months | simple baseline.`,
        `"purchase" = supplier purchases captured by a purchaser (a spending figure: aim to keep it in line with workload, not grow it aggressively).`,
        `"sales" = customer invoices on a service advisor's job cards. "technician" = customer invoices for jobs a technician worked on.`,
        `For sales and technician, set a stretch target roughly 5–15% above recent performance, considering the trend and ignoring one-off spikes.`,
        `Months with 0 may mean the person was new or absent; do not punish them. Round every target to the nearest 500, minimum 500.`,
        `Return one suggestion per key, using the key exactly as given.`,
        ``,
        ...promptLines,
      ].join("\n"),
    })
    for (const s of object.suggestions) {
      const [kind, id] = s.key.split(":") as [TargetKind, string]
      const current = suggestions[kind]?.[id]
      if (!current || !Number.isFinite(s.target) || s.target < 0) continue
      current.target = roundTarget(s.target)
      current.reason = s.reason.slice(0, 240)
    }
    return { ok: true, suggestions, ai: true }
  } catch (err) {
    console.log("[v0] suggestStaffTargets AI error:", err instanceof Error ? err.message : String(err))
    return { ok: true, suggestions, ai: false }
  }
}
