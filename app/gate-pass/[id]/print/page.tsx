import { notFound } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import { formatCurrency } from "@/lib/utils"
import { PrintButton } from "@/components/gate-pass/print-button"

const timeFmt = new Intl.DateTimeFormat("en-AE", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" })

export default async function GatePassPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const svc = createServiceClient()
  const { data: pass } = await svc
    .from("gate_passes")
    .select(
      "pass_number, issued_at, amount_paid, payment_method, keys_released_at, released_to, jobs(job_number, customer_name, vehicle_make, vehicle_model, color, plate_emirate, plate_code, plate_number)",
    )
    .eq("id", id)
    .maybeSingle()
  if (!pass) notFound()
  const j = pass.jobs as unknown as Record<string, string | null> | null
  const plate = [j?.plate_emirate, j?.plate_code, j?.plate_number].filter(Boolean).join(" ")
  const code = String(pass.pass_number).slice(-4)

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6">
      <article className="w-full overflow-hidden rounded-2xl border-2 border-foreground bg-background text-foreground print:border-black">
        <header className="flex items-center justify-between border-b-2 border-dashed border-foreground px-6 py-4">
          <span className="text-sm font-bold uppercase tracking-widest">SHWURX Auto</span>
          <span className="text-xs font-semibold uppercase tracking-wide">Vehicle Gate Pass</span>
        </header>
        <div className="flex flex-col gap-5 px-6 py-6">
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Release code</span>
            <span className="font-mono text-5xl font-bold tracking-[0.3em]">{code}</span>
            <span className="font-mono text-sm">{pass.pass_number}</span>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Item label="Customer" value={j?.customer_name} />
            <Item label="Job" value={j?.job_number} />
            <Item label="Vehicle" value={[j?.vehicle_make, j?.vehicle_model, j?.color].filter(Boolean).join(" ")} />
            <Item label="Plate" value={plate} />
            <Item label="Paid" value={pass.amount_paid != null ? formatCurrency(Number(pass.amount_paid)) : "Paid in full"} />
            <Item label="Issued" value={timeFmt.format(new Date(pass.issued_at))} />
          </dl>
          {pass.keys_released_at && (
            <p className="rounded-lg border border-foreground px-3 py-2 text-center text-sm font-semibold">
              Keys released to {pass.released_to} · {timeFmt.format(new Date(pass.keys_released_at))}
            </p>
          )}
        </div>
        <footer className="border-t-2 border-dashed border-foreground px-6 py-3 text-center text-xs text-muted-foreground">
          Show this pass at the gate to collect your keys.
        </footer>
      </article>
      <PrintButton />
    </main>
  )
}

function Item({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value || "—"}</dd>
    </div>
  )
}
