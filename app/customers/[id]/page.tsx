import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { Card, Badge, Button } from "@/components/ui"
import { formatCurrency, formatDate } from "@/lib/utils"
import { STAGES } from "@/lib/constants"
import { BrandLogo } from "@/components/vehicle-visual"
import { PortalLinkButton } from "@/components/portal-link-button"
import { ArrowLeft, Pencil, Plus, Phone, Mail, Building2, Car, FileText, ReceiptText, Wrench } from "lucide-react"

export const metadata = { title: "Customer · SHWURX Garage" }

function plateLabel(v: { plate_emirate?: string | null; plate_code?: string | null; plate_number?: string | null }) {
  return [v.plate_emirate, v.plate_code, v.plate_number].filter(Boolean).join(" ") || "No plate"
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getShellUser()
  const supabase = await createClient()

  const { data: customer } = await supabase.from("customers").select("*").eq("id", id).single()
  if (!customer) notFound()

  const [{ data: vehicles }, { data: jobs }] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, make, model, variant, year, color, plate_emirate, plate_code, plate_number, vin, reference_image_url")
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("jobs")
      .select("id, job_number, stage, vehicle_make, vehicle_model, plate_number, created_at, vehicle_id")
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
  ])

  const jobIds = (jobs ?? []).map((j) => j.id)
  const [{ data: invoices }, { data: quotations }] = await Promise.all([
    jobIds.length
      ? supabase
          .from("invoices")
          .select("id, invoice_number, status, issue_date, total, amount_paid, job_id")
          .in("job_id", jobIds)
          .order("issue_date", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    jobIds.length
      ? supabase.from("quotations").select("id, job_id, total, created_at").in("job_id", jobIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const totalInvoiced = (invoices ?? []).reduce((s, i) => s + Number(i.total || 0), 0)
  const totalPaid = (invoices ?? []).reduce((s, i) => s + Number(i.amount_paid || 0), 0)
  const outstanding = Math.max(0, totalInvoiced - totalPaid)

  const stageLabel = (v: string) => STAGES.find((s) => s.key === v)?.label ?? v

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-6xl">
        <Link
          href="/customers"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to customers
        </Link>

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{customer.full_name}</h1>
              {customer.status === "inactive" ? (
                <Badge className="bg-muted text-muted-foreground">Inactive</Badge>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {customer.mobile ? (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> {customer.mobile}
                </span>
              ) : null}
              {customer.email ? (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> {customer.email}
                </span>
              ) : null}
              {customer.company_name ? (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> {customer.company_name}
                  {customer.trn ? ` · TRN ${customer.trn}` : ""}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex gap-2">
            {user.permissions.includes("customers.edit") && <PortalLinkButton customerId={id} />}
            {user.permissions.includes("customers.edit") && (
              <Link href={`/customers/${id}/edit`}>
                <Button variant="outline" size="sm">
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              </Link>
            )}
            {user.permissions.includes("jobs.create") && (
              <Link href={`/jobs/new?customer=${id}`}>
                <Button size="sm">
                  <Plus className="h-4 w-4" /> New Job Card
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Financial summary */}
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Total invoiced</div>
            <div className="mt-1 text-xl font-bold">{formatCurrency(totalInvoiced)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Paid</div>
            <div className="mt-1 text-xl font-bold text-emerald-500">{formatCurrency(totalPaid)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Outstanding</div>
            <div className={`mt-1 text-xl font-bold ${outstanding > 0 ? "text-amber-500" : ""}`}>
              {formatCurrency(outstanding)}
            </div>
          </Card>
        </div>

        {/* Vehicles */}
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <Car className="h-4 w-4" /> Vehicles ({(vehicles ?? []).length})
            </h2>
            <Link href={`/vehicles/new?customer=${id}`}>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4" /> Add Vehicle
              </Button>
            </Link>
          </div>
          {(vehicles ?? []).length === 0 ? (
            <Card className="py-8 text-center text-sm text-muted-foreground">No vehicles on file.</Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {(vehicles ?? []).map((v) => (
                <Link key={v.id} href={`/vehicles/${v.id}`}>
                  <Card className="flex items-center gap-3 p-4 transition-colors hover:border-primary/50">
                    <div className="h-14 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                      {v.reference_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={v.reference_image_url || "/placeholder.svg"}
                          alt={`${v.make ?? ""} ${v.model ?? ""}`}
                          className="h-full w-full object-cover"
                          crossOrigin="anonymous"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <BrandLogo make={v.make} size={28} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">
                        {[v.year, v.make, v.model, v.variant].filter(Boolean).join(" ") || "Vehicle"}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{plateLabel(v)}</div>
                      {v.vin ? <div className="text-xs text-muted-foreground">VIN {v.vin}</div> : null}
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Job cards */}
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Wrench className="h-4 w-4" /> Job Cards ({(jobs ?? []).length})
          </h2>
          {(jobs ?? []).length === 0 ? (
            <Card className="py-8 text-center text-sm text-muted-foreground">No job cards yet.</Card>
          ) : (
            <div className="grid gap-2">
              {(jobs ?? []).map((j) => (
                <Link key={j.id} href={`/jobs/${j.id}`}>
                  <Card className="flex items-center justify-between gap-4 p-3.5 transition-colors hover:border-primary/50">
                    <div className="min-w-0">
                      <span className="font-medium text-foreground">{j.job_number}</span>
                      <span className="ml-3 text-sm text-muted-foreground">
                        {[j.vehicle_make, j.vehicle_model].filter(Boolean).join(" ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className="bg-muted text-muted-foreground">{stageLabel(j.stage)}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(j.created_at)}</span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Invoices */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <ReceiptText className="h-4 w-4" /> Invoices ({(invoices ?? []).length})
            {(quotations ?? []).length ? (
              <span className="ml-2 inline-flex items-center gap-1 font-normal normal-case text-muted-foreground">
                <FileText className="h-3.5 w-3.5" /> {(quotations ?? []).length} quotation
                {(quotations ?? []).length === 1 ? "" : "s"}
              </span>
            ) : null}
          </h2>
          {(invoices ?? []).length === 0 ? (
            <Card className="py-8 text-center text-sm text-muted-foreground">No invoices yet.</Card>
          ) : (
            <div className="grid gap-2">
              {(invoices ?? []).map((i) => {
                const bal = Number(i.total || 0) - Number(i.amount_paid || 0)
                return (
                  <Link key={i.id} href={`/invoices/${i.id}`}>
                    <Card className="flex items-center justify-between gap-4 p-3.5 transition-colors hover:border-primary/50">
                      <div>
                        <span className="font-medium text-foreground">{i.invoice_number}</span>
                        <span className="ml-3 text-xs text-muted-foreground">{formatDate(i.issue_date)}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-medium">{formatCurrency(Number(i.total || 0))}</span>
                        <Badge
                          className={
                            i.status === "paid"
                              ? "bg-emerald-500/15 text-emerald-500"
                              : bal > 0
                                ? "bg-amber-500/15 text-amber-500"
                                : "bg-muted text-muted-foreground"
                          }
                        >
                          {i.status}
                        </Badge>
                      </div>
                    </Card>
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  )
}
