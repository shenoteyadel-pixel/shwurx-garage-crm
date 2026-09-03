import { headers } from "next/headers"
import { Wrench } from "lucide-react"
import { resolvePortalToken, recordTrackingOpen } from "@/lib/portal-data"
import { PortalView } from "@/components/portal-view"

export const metadata = { title: "Track Your Vehicle · SHWURX Garage" }

// Public, secure, tokenized tracking page. The token is an opaque random string
// (never a raw DB id) and only resolves customer-safe data. This page is in the
// proxy's public allow-list, so an invalid token renders the branded notice
// below — it is NEVER redirected to the staff sign-in page.
export default async function TrackTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const data = await resolvePortalToken(token)

  if (!data) return <InvalidTrackingLink />

  // Best-effort audit of the open event (first/last opened, count). Never blocks render.
  const h = await headers()
  await recordTrackingOpen(token, {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent") ?? null,
  }).catch(() => {})

  return <PortalView data={data} />
}

function InvalidTrackingLink() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
        <Wrench className="h-7 w-7 text-primary-foreground" />
      </div>
      <div className="text-xs font-bold uppercase tracking-[0.2em] text-primary">SHWURX Garage</div>
      <h1 className="mt-3 text-balance text-2xl font-bold">Tracking link invalid or expired</h1>
      <p className="mt-3 max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
        This tracking link is no longer valid. It may have expired or been replaced. Please contact SHWURX Garage and
        we&apos;ll send you a new secure tracking link.
      </p>
    </main>
  )
}
