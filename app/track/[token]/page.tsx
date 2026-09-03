import { headers } from "next/headers"
import { Wrench } from "lucide-react"
import { resolveTrackingToken, recordTrackingOpen } from "@/lib/portal-data"
import { loadTrackingDetail } from "@/lib/tracking-data"
import { TrackExperience } from "@/components/track-experience"

export const metadata = { title: "Track Your Vehicle · SHWURX Garage" }

// Public, secure, tokenized tracking page. The token is an opaque random string
// (never a raw DB id) and only resolves customer-safe data. This page is in the
// proxy's public allow-list, so an invalid token renders the branded notice
// below — it is NEVER redirected to the staff sign-in page.
export default async function TrackTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const result = await resolveTrackingToken(token)

  // Missing or revoked link — friendly notice with a route to the portal.
  if (!result) return <TrackingNotice variant="invalid" />

  // Expired link (job delivered and past the grace window) — send them to the
  // customer portal instead of a dead end. Never the staff sign-in page.
  if (result.status === "expired") return <TrackingNotice variant="expired" />

  // Load the full customer-safe detail for the premium tracking experience.
  const detail = await loadTrackingDetail(result.data.customer.id)
  if (!detail) return <TrackingNotice variant="invalid" />

  // Best-effort audit of the open event (first/last opened, count). Never blocks render.
  const h = await headers()
  await recordTrackingOpen(token, {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent") ?? null,
  }).catch(() => {})

  return <TrackExperience detail={detail} status={result.status} />
}

function TrackingNotice({ variant }: { variant: "invalid" | "expired" }) {
  const expired = variant === "expired"
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
        <Wrench className="h-7 w-7 text-primary-foreground" />
      </div>
      <div className="text-xs font-bold uppercase tracking-[0.2em] text-primary">SHWURX Garage</div>
      <h1 className="mt-3 text-balance text-2xl font-bold">
        {expired ? "This tracking link has expired" : "Tracking link invalid"}
      </h1>
      <p className="mt-3 max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
        {expired
          ? "Your vehicle's service is complete. You can still view your full service history and invoices anytime in your customer portal."
          : "This tracking link is no longer valid. It may have been replaced. You can access your service history through your customer portal, or contact us for a new link."}
      </p>
      <a
        href="/portal"
        className="mt-6 inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        Go to Customer Portal
      </a>
    </main>
  )
}
