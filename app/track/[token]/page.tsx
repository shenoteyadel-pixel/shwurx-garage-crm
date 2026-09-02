import { notFound } from "next/navigation"
import { resolvePortalToken } from "@/lib/portal-data"
import { PortalView } from "@/components/portal-view"

export const metadata = { title: "Track Your Vehicle · SHWURX Garage" }

// Public, secure, tokenized tracking page. The token is an opaque random string
// (never a raw DB id) and only resolves customer-safe data.
export default async function TrackTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const data = await resolvePortalToken(token)
  if (!data) notFound()
  return <PortalView data={data} />
}
