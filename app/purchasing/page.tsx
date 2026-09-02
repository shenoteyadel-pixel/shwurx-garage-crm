import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, Button, Badge } from "@/components/ui"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Plus, ShoppingCart } from "lucide-react"

export const metadata = { title: "Purchasing · SHWURX Garage" }

const STATUS: Record<string, string> = {
  draft: "border-neutral-500/30 bg-neutral-500/15 text-neutral-300",
  ordered: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  received: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  cancelled: "border-red-500/30 bg-red-500/15 text-red-300",
}

export default async function PurchasingPage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string }>
}) {
  const { supplier } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  let query = supabase
    .from("purchase_orders")
    .select("*, suppliers(name)")
    .order("created_at", { ascending: false })
  if (supplier) query = query.eq("supplier_id", supplier)
  const { data: pos } = await query

  const totalOutstanding = (pos ?? []).reduce(
    (s, p) => s + (p.status === "cancelled" ? 0 : (Number(p.total) || 0) - (Number(p.amount_paid) || 0)),
    0,
  )

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Purchasing</h1>
          <p className="text-sm text-muted-foreground">
            {(pos ?? []).length} purchase orders · {formatCurrency(totalOutstanding)} payable
          </p>
        </div>
        <Link href="/purchasing/new">
          <Button>
            <Plus className="h-4 w-4" /> New Purchase Order
          </Button>
        </Link>
      </div>

      {(pos ?? []).length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-16 text-center">
          <ShoppingCart className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No purchase orders yet.</p>
          <Link href="/purchasing/new">
            <Button variant="outline" className="mt-2">
              <Plus className="h-4 w-4" /> New Purchase Order
            </Button>
          </Link>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">PO Number</th>
                  <th className="px-4 py-3 font-semibold">Supplier</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3 text-right font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody>
                {(pos ?? []).map((p) => {
                  const bal = (Number(p.total) || 0) - (Number(p.amount_paid) || 0)
                  return (
                    <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <Link href={`/purchasing/${p.id}`} className="font-mono font-medium text-primary hover:underline">
                          {p.po_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{(p as any).suppliers?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(p.order_date)}</td>
                      <td className="px-4 py-3">
                        <Badge className={STATUS[p.status] ?? STATUS.draft}>{p.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(p.total)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className={bal > 0.01 && p.status !== "cancelled" ? "text-amber-400" : "text-emerald-400"}>
                          {formatCurrency(p.status === "cancelled" ? 0 : bal)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
