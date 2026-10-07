"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui"
import { Loader2, Pencil, Plus } from "lucide-react"
import { createBlankInvoice, reopenInvoiceForEdit } from "@/lib/actions-invoices"

export function ReopenInvoiceButton({ id }: { id: string }) {
  const router = useRouter()
  const [pending, start] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  function onClick() {
    if (
      !window.confirm(
        "Reopen this invoice for editing? Its stock and job card postings are undone now and re-posted when you confirm again. Payments are kept.",
      )
    )
      return
    setError(null)
    start(async () => {
      const res = await reopenInvoiceForEdit(id)
      if (!res.ok) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" onClick={onClick} disabled={pending} className="h-11 gap-1.5">
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Pencil className="h-4 w-4" aria-hidden="true" />
        )}
        {pending ? "Reopening…" : "Edit invoice"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

export function NewBlankInvoiceButton() {
  const router = useRouter()
  const [pending, start] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  function onClick() {
    setError(null)
    start(async () => {
      const res = await createBlankInvoice()
      if (!res.ok) setError(res.error)
      else router.push(`/purchasing/invoices/${res.id}`)
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="outline" onClick={onClick} disabled={pending} className="h-11 gap-1.5 self-start">
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Plus className="h-4 w-4" aria-hidden="true" />
        )}
        {pending ? "Creating…" : "New invoice (type manually)"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
