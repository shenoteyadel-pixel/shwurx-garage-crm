import { redirect } from "next/navigation"

// Spec alias for customer approval links. The canonical per-item approval page
// is /approve/r/[token]; this keeps the /approval/<token> path (named in the
// workflow spec) working without staff login. Both are public in the proxy.
export default async function ApprovalAliasPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  redirect(`/approve/r/${token}`)
}
