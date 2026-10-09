"use client"

import { useState, useTransition } from "react"
import { MessageSquare, Trash2, Send } from "lucide-react"
import { Card } from "@/components/ui"
import { addInvoiceComment, deleteInvoiceComment } from "@/lib/actions-invoice-comments"
import type { InvoiceComment } from "@/lib/invoice-comments"

function fmt(ts: string) {
  return new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function InvoiceComments({
  invoiceId,
  comments,
  currentUserId,
  isOwner,
}: {
  invoiceId: string
  comments: InvoiceComment[]
  currentUserId: string | null
  isOwner: boolean
}) {
  const [body, setBody] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = () => {
    if (!body.trim()) return
    setError(null)
    startTransition(async () => {
      const res = await addInvoiceComment(invoiceId, body)
      if (res.error) setError(res.error)
      else setBody("")
    })
  }

  const remove = (id: string) => {
    if (!confirm("Delete this comment? The customer will no longer see it.")) return
    startTransition(async () => {
      const res = await deleteInvoiceComment(id)
      if (res.error) setError(res.error)
    })
  }

  return (
    <Card className="mb-4 p-4">
      <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <MessageSquare className="h-4 w-4" /> Comments to customer
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        The customer sees these on the printed invoice / PDF and in their portal.
      </p>

      {comments.length > 0 && (
        <ul className="mb-3 flex flex-col gap-2">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg border border-border bg-background/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{c.body}</p>
                {(isOwner || c.author_id === currentUserId) && (
                  <button
                    type="button"
                    onClick={() => remove(c.id)}
                    disabled={pending}
                    className="shrink-0 text-muted-foreground transition hover:text-red-400 disabled:opacity-50"
                    aria-label="Delete comment"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="mt-1.5 text-xs text-muted-foreground">
                {c.author_name || "Staff"} · {fmt(c.created_at)}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="invoice-comment" className="sr-only">
          New comment
        </label>
        <textarea
          id="invoice-comment"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Write a comment for the customer…"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={pending || !body.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> {pending ? "Saving…" : "Add comment"}
          </button>
        </div>
      </div>
    </Card>
  )
}
