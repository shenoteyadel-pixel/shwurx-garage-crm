"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui"
import { createInvoiceFromQuote } from "@/lib/actions-quote-invoice"
import { FileCheck2, Loader2 } from "lucide-react"

export function CreateInvoiceFromQuoteButton({
  quoteId,
  size = "sm",
  label = "Create invoice from quote",
}: {
  quoteId: string
  size?: "sm" | "md"
  label?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  const run = () => {
    setError(null)
    startTransition(async () => {
      const res = await createInvoiceFromQuote(quoteId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.push(`/purchasing/invoices/${res.id}`)
    })
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" size={size} onClick={run} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
        {label}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
