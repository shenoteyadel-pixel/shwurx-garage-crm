import { Car } from "lucide-react"

export const metadata = { title: "Customer Portal · SHWURX Garage" }

export default function PortalLanding() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
          <Car className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">SHWURX Garage Customer Portal</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Track your vehicle&apos;s service progress and invoices using the secure link shared with you by our team.
        </p>
        <p className="mt-6 text-xs text-muted-foreground">
          Don&apos;t have a link yet? Please contact your service advisor and we&apos;ll send you one.
        </p>
      </div>
    </main>
  )
}
