import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { TopCustomersClient, type RankedRow } from "@/components/top-customers-client"

export const metadata = { title: "Top Customers · SHWURX Auto Service Center" }

const TOP_N = 20

type CustomerRef = {
  id: string
  full_name: string | null
  company_name: string | null
  customer_type: string | null
  mobile: string | null
}

type InvoiceRow = {
  customer_name: string | null
  customer_mobile: string | null
  issue_date: string | null
  total: number | null
  amount_paid: number | null
  jobs: { customer_id: string | null; customers: CustomerRef | null } | null
}

function yearRange() {
  const year = new Date().getFullYear()
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

type Acc = Omit<RankedRow, "rank">

function addTo(map: Map<string, Acc>, key: string, base: Omit<Acc, "total" | "paid" | "invoices" | "lastVisit">, inv: InvoiceRow) {
  const total = Number(inv.total) || 0
  const paid = Number(inv.amount_paid) || 0
  const row = map.get(key) ?? { ...base, total: 0, paid: 0, invoices: 0, lastVisit: null }
  row.total += total
  row.paid += paid
  row.invoices += 1
  if (inv.issue_date && (!row.lastVisit || inv.issue_date > row.lastVisit)) row.lastVisit = inv.issue_date
  map.set(key, row)
}

function rank(map: Map<string, Acc>): RankedRow[] {
  return [...map.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP_N)
    .map((r, i) => ({ ...r, rank: i + 1 }))
}

export default async function TopCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const sp = await searchParams
  const shellUser = await getShellUser()
  const supabase = await createClient()

  const def = yearRange()
  const from = sp.from || def.from
  const to = sp.to || def.to

  const { data } = await supabase
    .from("invoices")
    .select(
      "customer_name, customer_mobile, issue_date, total, amount_paid, jobs(customer_id, customers(id, full_name, company_name, customer_type, mobile))",
    )
    .gte("issue_date", from)
    .lte("issue_date", to)
    .neq("status", "cancelled")

  const individuals = new Map<string, Acc>()
  const companies = new Map<string, Acc>()

  for (const inv of (data ?? []) as unknown as InvoiceRow[]) {
    const c = inv.jobs?.customers ?? null
    const companyName = c?.company_name?.trim() || ""
    const isCompany = c?.customer_type === "company" || companyName.length > 0

    if (c && isCompany) {
      const name = companyName || c.full_name || "Unnamed company"
      addTo(companies, name.toLowerCase(), { id: c.id, name, contact: c.full_name, mobile: c.mobile }, inv)
    } else if (c) {
      addTo(individuals, c.id, { id: c.id, name: c.full_name || "Unnamed", contact: null, mobile: c.mobile }, inv)
    } else {
      const name = inv.customer_name?.trim() || "Walk-in"
      const key = `${name.toLowerCase()}|${inv.customer_mobile ?? ""}`
      addTo(individuals, key, { id: null, name, contact: null, mobile: inv.customer_mobile }, inv)
    }
  }

  return (
    <AppShell user={shellUser}>
      <div className="mx-auto max-w-6xl">
        <TopCustomersClient from={from} to={to} customers={rank(individuals)} companies={rank(companies)} />
      </div>
    </AppShell>
  )
}
