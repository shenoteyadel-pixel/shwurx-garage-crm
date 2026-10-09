import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { BrandLogo } from "@/components/vehicle-visual"
import type { CustomerSummary, VehicleSummary } from "@/lib/history-data"
import { PlateText, aed, shortDate } from "./history-shared"

function RowLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  const cls =
    "flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors md:flex-row md:items-center md:gap-6"
  return href ? (
    <Link href={href} className={`${cls} hover:border-primary/50`}>
      {children}
      <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground md:block" aria-hidden="true" />
    </Link>
  ) : (
    <div className={cls}>{children}</div>
  )
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`truncate text-sm font-medium tabular-nums ${tone ?? ""}`}>{value}</div>
    </div>
  )
}

export function HistoryCustomers({ rows }: { rows: CustomerSummary[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((c) => (
        <li key={c.key}>
          <RowLink href={c.customerId ? `/customers/${c.customerId}` : null}>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-sm font-semibold"
              >
                {c.name.trim().charAt(0).toUpperCase() || "?"}
              </span>
              <div className="min-w-0">
                <div className="truncate font-semibold">{c.name}</div>
                <div className="truncate text-xs tabular-nums text-muted-foreground">
                  {c.mobile || "No mobile on file"}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 md:grid-cols-5 md:gap-6">
              <Figure label="Cars" value={String(c.vehicles)} />
              <Figure label="Visits" value={String(c.visits)} />
              <Figure label="Invoiced" value={aed(c.invoiced)} />
              <Figure
                label="Outstanding"
                value={c.outstanding > 0 ? aed(c.outstanding) : "Settled"}
                tone={c.outstanding > 0 ? "text-amber-400" : "text-emerald-400"}
              />
              <Figure label="Last visit" value={shortDate(c.lastVisit)} />
            </div>
          </RowLink>
        </li>
      ))}
    </ul>
  )
}

export function HistoryVehicles({ rows }: { rows: VehicleSummary[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((v) => (
        <li key={v.key}>
          <RowLink href={v.vehicleId ? `/vehicles/${v.vehicleId}` : null}>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <BrandLogo make={v.make} size={40} className="shrink-0" />
              <div className="min-w-0">
                <div className="truncate font-semibold">{v.label}</div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <PlateText text={v.plateText} />
                  {v.vin ? <span className="truncate font-mono">{v.vin}</span> : null}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
              <Figure label="Owner" value={v.ownerName} />
              <Figure label="Visits" value={String(v.visits)} />
              <Figure label="Invoiced" value={aed(v.invoiced)} />
              <Figure label="Last service" value={shortDate(v.lastService)} />
            </div>
          </RowLink>
        </li>
      ))}
    </ul>
  )
}
