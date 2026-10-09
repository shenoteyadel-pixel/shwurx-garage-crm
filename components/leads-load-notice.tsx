import { AlertTriangle, Info } from "lucide-react"
import { Card } from "@/components/ui"

/** Bounded copy only: no SQL, error codes, or record data reach the page. */
export function LeadsLoadError() {
  return (
    <Card role="alert" className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <AlertTriangle className="h-10 w-10 text-amber-400" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">Could not load leads. Try again.</p>
      {/* A plain link performs a normal navigation that re-runs the server query. */}
      <a
        href="/leads"
        className="inline-flex h-9 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
      >
        Retry
      </a>
    </Card>
  )
}

export function StaffListUnavailableNotice() {
  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
    >
      <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        Staff list could not be loaded, so lead assignment is unavailable.{" "}
        <a href="/leads" className="font-medium text-foreground underline underline-offset-2">
          Retry
        </a>
      </span>
    </div>
  )
}
