import { redirect } from "next/navigation"

// Legacy alias. The canonical secure tracking surface is /track/[token], which
// renders the branded invalid-link notice and records open events. Redirect any
// old /portal/t/<token> links there so there is exactly one tracking page.
export default async function LegacyPortalTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  redirect(`/track/${token}`)
}
