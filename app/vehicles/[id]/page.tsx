import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { Card, Badge } from "@/components/ui"
import { VehicleVisual, BrandLogo } from "@/components/vehicle-visual"
import { VehicleActions } from "@/components/vehicle-actions"
import { formatCurrency, formatDate } from "@/lib/utils"
import { STAGES } from "@/lib/constants"
import { ArrowLeft, Car, Gauge, Hash, Fingerprint, Palette, FileText, ReceiptText } from "lucide-react"

export const metadata = { title: "Vehicle · SHWURX Garage" }

function plateStr(v: any) {
  return [v.plate_emirate, v.plate_code, v.plate_number].filter(Boolean).join(" ") || "No plate"
}

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getShellUser()
  const supabase = await createClient()

  const { data: vehicle } = await supabase.from("vehicles").select("*").eq("id", id).single()
  if (!vehicle) notFound()

  const [{ data: owner }, { data: jobs }, { data: customers }] = await Promise.all([
    vehicle.customer_id
      ? supabase.from("customers").select("id, full_name, mobile, company_name").eq("id", vehicle.customer_id).single()
      : Promise.resolve({ data: null } as any),
    supabase
      .from("jobs")
      .select("id, job_number, stage, created_at, complaint, mileage")
      .eq("vehicle_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("customers").select("id, full_name, mobile").order("full_name"),
  ])

  const jobIds = (jobs ?? []).map((j) => j.id)
  const [{ data: quotations }, { data: invoices }] = await Promise.all([
    jobIds.length
      ? supabase.from("quotations").select("job_id, total, created_at").in("job_id", jobIds)
      : Promise.resolve({ data: [] } as any),
    jobIds.length
      ? supabase.from("invoices").select("id, invoice_number, job_id, total, status, issue_date").in("job_id", jobIds)
      : Promise.resolve({ data: [] } as any),
  ])

  const stageLabel = (v: string) => STAGES.find((s) => s.key === v)?.label ?? v
  const totalInvoiced = (invoices ?? []).reduce((s: number, i: any) => s + Number(i.total || 0), 0)
  const invByJob = new Map<string, any>()
  for (const inv of invoices ?? []) if (inv.job_id) invByJob.set(inv.job_id, inv)
  const quoteByJob = new Map<string, any>()
  for (const q of quotations ?? []) if (q.job_id) quoteByJob.set(q.job_id, q)

  const title = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle"

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-5xl">
        <Link
          href={owner ? `/customers/${owner.id}` : "/customers"}
          className="mb-4 flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {owner ? owner.full_name : "Customers"}
        </Link>

        <div className="grid gap-6 md:grid-cols-[300px_1fr]">
          <div className="space-y-4">
            <Card className="overflow-hidden p-0">
              <VehicleVisual
                referenceImage={vehicle.reference_image_url}
                make={vehicle.make}
                model={vehicle.model}
                bodyType={vehicle.body_type}
                color={vehicle.color}
                className="aspect-[4/3] w-full"
              />
            </Card>
            <VehicleActions vehicle={vehicle} customers={customers ?? []} currentOwnerId={vehicle.customer_id} />
          </div>

          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <BrandLogo make={vehicle.make} size={48} />
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-balance">{title}</h1>
                <p className="font-mono text-sm text-muted-foreground">{plateStr(vehicle)}</p>
              </div>
            </div>

            <Card className="p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Vehicle Details
              </h2>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <Detail icon={Car} label="Variant" value={vehicle.variant} />
                <Detail icon={Palette} label="Colour" value={vehicle.color} />
                <Detail icon={Gauge} label="Last mileage" value={vehicle.mileage ? `${vehicle.mileage} km` : null} />
                <Detail icon={Car} label="Body type" value={vehicle.body_type} />
                <Detail icon={Fingerprint} label="VIN / Chassis" value={vehicle.vin} mono />
                <Detail icon={Hash} label="Engine no." value={vehicle.engine_number} mono />
              </dl>
              {vehicle.notes ? (
                <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">{vehicle.notes}</p>
              ) : null}
            </Card>

            <div className="grid grid-cols-3 gap-3">
              <Stat label="Total visits" value={String((jobs ?? []).length)} />
              <Stat label="Invoiced" value={formatCurrency(totalInvoiced)} />
              <Stat
                label="Owner"
                value={owner ? owner.full_name.split(" ")[0] : "—"}
                href={owner ? `/customers/${owner.id}` : undefined}
              />
            </div>

            <Card className="p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Service History
              </h2>
              {(jobs ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No service records for this vehicle yet.</p>
              ) : (
                <ol className="relative space-y-4 border-l border-border pl-5">
                  {(jobs ?? []).map((j) => {
                    const inv = invByJob.get(j.id)
                    const quote = quoteByJob.get(j.id)
                    return (
                      <li key={j.id} className="relative">
                        <span className="absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Link href={`/jobs/${j.id}`} className="font-medium hover:underline">
                            {j.job_number}
                          </Link>
                          <span className="text-xs text-muted-foreground">{formatDate(j.created_at)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <Badge className="border-border bg-secondary text-secondary-foreground">
                            {stageLabel(j.stage)}
                          </Badge>
                          {j.mileage ? <span className="text-muted-foreground">{j.mileage} km</span> : null}
                          {quote ? (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <FileText className="h-3 w-3" /> {formatCurrency(Number(quote.total || 0))}
                            </span>
                          ) : null}
                          {inv ? (
                            <Link
                              href={`/invoices/${inv.id}`}
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              <ReceiptText className="h-3 w-3" /> {inv.invoice_number}
                            </Link>
                          ) : null}
                        </div>
                        {j.complaint ? (
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{j.complaint}</p>
                        ) : null}
                      </li>
                    )
                  })}
                </ol>
              )}
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

function Detail({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: any
  label: string
  value: string | null | undefined
  mono?: boolean
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className={mono ? "font-mono text-sm" : "text-sm"}>{value || "—"}</dd>
      </div>
    </div>
  )
}

function Stat({ label, value, href }: { label: string; value: string; href?: string }) {
  const inner = (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold">{value}</p>
    </Card>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}
