import "server-only"
import { createServiceClient } from "@/lib/supabase/server"

export interface InvoiceComment {
  id: string
  invoice_id: string
  body: string
  author_id: string | null
  author_name: string | null
  created_at: string
}

/** invoice_comments has RLS on with no policies, so it is only reachable server-side via the service client. */
export async function loadInvoiceComments(invoiceIds: string[]): Promise<InvoiceComment[]> {
  if (invoiceIds.length === 0) return []
  const { data } = await createServiceClient()
    .from("invoice_comments")
    .select("id, invoice_id, body, author_id, author_name, created_at")
    .in("invoice_id", invoiceIds)
    .order("created_at", { ascending: true })
  return (data ?? []) as InvoiceComment[]
}
