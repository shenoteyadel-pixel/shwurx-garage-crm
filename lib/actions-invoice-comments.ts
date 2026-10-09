"use server"

import { revalidatePath } from "next/cache"
import { createServiceClient } from "@/lib/supabase/server"
import { requirePermission, logAction } from "@/lib/rbac/context"

export async function addInvoiceComment(invoiceId: string, body: string): Promise<{ error?: string }> {
  const ctx = await requirePermission("invoices.view")
  if (ctx.role === "customer") return { error: "Not allowed" }
  const text = body.trim()
  if (!text) return { error: "Comment cannot be empty" }
  if (text.length > 2000) return { error: "Comment is too long (max 2000 characters)" }

  const svc = createServiceClient()
  const { data: inv } = await svc.from("invoices").select("id").eq("id", invoiceId).maybeSingle()
  if (!inv) return { error: "Invoice not found" }

  const { error } = await svc
    .from("invoice_comments")
    .insert({ invoice_id: invoiceId, body: text, author_id: ctx.userId, author_name: ctx.name })
  if (error) return { error: error.message }

  await logAction(ctx, "invoice_comment_added", "invoice", invoiceId)
  revalidatePath(`/invoices/${invoiceId}`)
  revalidatePath("/portal")
  return {}
}

export async function deleteInvoiceComment(commentId: string): Promise<{ error?: string }> {
  const ctx = await requirePermission("invoices.view")
  const svc = createServiceClient()
  const { data: c } = await svc
    .from("invoice_comments")
    .select("id, invoice_id, author_id")
    .eq("id", commentId)
    .maybeSingle()
  if (!c) return { error: "Comment not found" }
  if (ctx.role !== "owner" && c.author_id !== ctx.userId) return { error: "Only the author or the owner can delete this comment" }

  const { error } = await svc.from("invoice_comments").delete().eq("id", commentId)
  if (error) return { error: error.message }

  await logAction(ctx, "invoice_comment_deleted", "invoice", c.invoice_id)
  revalidatePath(`/invoices/${c.invoice_id}`)
  revalidatePath("/portal")
  return {}
}
