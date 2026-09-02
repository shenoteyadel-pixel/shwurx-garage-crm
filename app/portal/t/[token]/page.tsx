import { notFound } from "next/navigation"
import { resolvePortalToken } from "@/lib/portal-data"
import { PortalView } from "@/components/portal-view"

export const metadata = { title: "Your Service Status · SHWURX Garage" }

export default async function PortalTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const data = await resolvePortalToken(token)
  if (!data) notFound()
  return <PortalView data={data} />
}
