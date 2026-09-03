import { redirect } from "next/navigation"

// Spec alias: /customer-access/<token> is the same secure tracking surface as
// /track/<token>. Redirect to the canonical route so open-tracking and branding
// stay in one place.
export default async function CustomerAccessAliasPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  redirect(`/track/${token}`)
}
