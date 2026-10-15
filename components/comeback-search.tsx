import Link from "next/link"
import { Search } from "lucide-react"
import { Card } from "@/components/ui"
import { CreateComebackButton } from "@/components/comeback-panel"
import { formatDate } from "@/lib/utils"

export type ComebackSearchResult = {
  id: string
  job_number: string
  created_at: string
  stage: string | null
  customer_name: string | null
  customer_mobile: string | null
  vehicle_make: string | null
  vehicle_model: string | null
  plate_code: string | null
  plate_number: string | null
  invoiceNumbers: string[]
  isComeback: boolean
}

export function ComebackSearch({
  query,
  results,
  canCreate,
  isOwner,
}: {
  query: string
  results: ComebackSearchResult[] | null
  canCreate: boolean
  isOwner: boolean
}) {
  return (
    <Card className="mb-6 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Open a comeback</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Find the earlier job card, then press &quot;Car came back&quot; to open a new comeback job card linked to it.
      </p>

      <form method="get" className="mt-4 flex flex-col gap-2 sm:flex-row" role="search">
        <label htmlFor="comeback-q" className="sr-only">
          Search by job card, invoice, plate or phone
        </label>
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            id="comeback-q"
            name="q"
            defaultValue={query}
            placeholder="Job card #, invoice #, plate, phone or name"
            autoComplete="off"
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <button
          type="submit"
          className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Search
        </button>
      </form>

      {results && (
        <div className="mt-4">
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">No job cards match &quot;{query}&quot;.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {results.map((r) => {
                const car = [r.vehicle_make, r.vehicle_model].filter(Boolean).join(" ") || "Unknown car"
                const plate = [r.plate_code, r.plate_number].filter(Boolean).join(" ")
                return (
                  <li key={r.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/jobs/${r.id}`} className="font-mono text-sm text-primary hover:underline">
                          {r.job_number}
                        </Link>
                        <span className="text-xs text-muted-foreground">{formatDate(r.created_at)}</span>
                        {r.stage && (
                          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                            {r.stage.replace(/_/g, " ")}
                          </span>
                        )}
                        {r.isComeback && (
                          <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-xs text-amber-500">
                            comeback
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-sm text-foreground">
                        {car}
                        {plate && <span className="text-muted-foreground"> · {plate}</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[r.customer_name, r.customer_mobile].filter(Boolean).join(" · ") || "—"}
                        {r.invoiceNumbers.length > 0 && <> · Invoice {r.invoiceNumbers.join(", ")}</>}
                      </p>
                    </div>
                    {canCreate && (
                      <div className="shrink-0">
                        <CreateComebackButton jobId={r.id} isOwner={isOwner} />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}
