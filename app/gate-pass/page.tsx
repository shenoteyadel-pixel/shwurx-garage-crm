import Link from "next/link"
import { CheckCircle2, KeyRound, Printer, Ticket } from "lucide-react"
import { createServiceClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { Card, UAEPlate } from "@/components/ui"
import { KeyReleaseForm } from "@/components/gate-pass/key-release-form"
import { formatCurrency } from "@/lib/utils"

type PassRow = {
  id: string
  job_id: string
  pass_number: string
  issued_at: string
  amount_paid: number | null
  payment_method: string | null
  keys_released_at: string | null
  released_to: string | null
  jobs: {
    job_number: string | null
    customer_name: string | null
    customer_mobile: string | null
    vehicle_make: string | null
    vehicle_model: string | null
    color: string | null
    plate_emirate: string | null
    plate_code: string | null
    plate_number: string | null
  } | null
}

const timeFmt = new Intl.DateTimeFormat("en-AE", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" })

export default async function GatePassPage() {
  const user = await getShellUser()
  // Security has no job access under RLS; the layout already enforced gate_pass.release.
  const svc = createServiceClient()
  const select =
    "id, job_id, pass_number, issued_at, amount_paid, payment_method, keys_released_at, released_to, jobs(job_number, customer_name, customer_mobile, vehicle_make, vehicle_model, color, plate_emirate, plate_code, plate_number)"
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [{ data: waiting }, { data: released }] = await Promise.all([
    svc.from("gate_passes").select(select).is("keys_released_at", null).order("issued_at", { ascending: true }),
    svc
      .from("gate_passes")
      .select(select)
      .gte("keys_released_at", since)
      .order("keys_released_at", { ascending: false })
      .limit(30),
  ])
  const pending = (waiting ?? []) as unknown as PassRow[]
  const done = (released ?? []) as unknown as PassRow[]

  return (
    <AppShell user={user}>
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Gate Pass &amp; Keys</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          A pass is issued automatically once a job is fully paid. Check the customer&apos;s pass code, then release the keys.
        </p>
      </div>

      <section aria-labelledby="waiting-heading" className="mb-10 flex flex-col gap-4">
        <h2 id="waiting-heading" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <KeyRound className="h-4 w-4" aria-hidden />
          Waiting for key handover ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">No paid cars are waiting for their keys.</Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {pending.map((p) => (
              <PassCard key={p.id} pass={p} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="released-heading" className="flex flex-col gap-3">
        <h2 id="released-heading" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          Released in the last 24 hours
        </h2>
        {done.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing released yet.</p>
        ) : (
          <Card className="divide-y divide-border">
            {done.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="flex flex-col">
                  <span className="font-medium">
                    {[p.jobs?.vehicle_make, p.jobs?.vehicle_model].filter(Boolean).join(" ") || "Vehicle"} · {p.jobs?.job_number}
                  </span>
                  <span className="text-muted-foreground">
                    To {p.released_to} · {p.keys_released_at ? timeFmt.format(new Date(p.keys_released_at)) : ""}
                  </span>
                </div>
                <span className="font-mono text-xs text-muted-foreground">{p.pass_number}</span>
              </div>
            ))}
          </Card>
        )}
      </section>
    </AppShell>
  )
}

function PassCard({ pass }: { pass: PassRow }) {
  const j = pass.jobs
  const vehicle = [j?.vehicle_make, j?.vehicle_model].filter(Boolean).join(" ") || "Vehicle"
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-dashed border-border bg-primary/5 px-5 py-4">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
            <Ticket className="h-3.5 w-3.5" aria-hidden />
            Paid · Gate pass
          </span>
          <span className="font-mono text-lg font-bold tracking-wider">{pass.pass_number}</span>
          <span className="text-xs text-muted-foreground">Issued {timeFmt.format(new Date(pass.issued_at))}</span>
        </div>
        <Link
          href={`/gate-pass/${pass.id}/print`}
          target="_blank"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          <Printer className="h-3.5 w-3.5" aria-hidden />
          Print pass
        </Link>
      </div>
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="font-semibold">
              {vehicle}
              {j?.color ? <span className="font-normal text-muted-foreground"> · {j.color}</span> : null}
            </span>
            <span className="text-sm text-muted-foreground">
              {j?.customer_name ?? "Customer"}
              {j?.customer_mobile ? ` · ${j.customer_mobile}` : ""} · {j?.job_number}
            </span>
          </div>
          <UAEPlate emirate={j?.plate_emirate} code={j?.plate_code} number={j?.plate_number} />
        </div>
        {pass.amount_paid != null && (
          <p className="text-sm text-muted-foreground">
            Paid {formatCurrency(Number(pass.amount_paid))}
            {pass.payment_method ? ` by ${pass.payment_method}` : ""}
          </p>
        )}
        <KeyReleaseForm passId={pass.id} customerName={j?.customer_name ?? ""} />
      </div>
    </Card>
  )
}
