"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Card, Button } from "@/components/ui"
import { AlertTriangle, ArrowLeft, RotateCw } from "lucide-react"

/**
 * Route-level error boundary for the invoice review page. Without this, any
 * error thrown while rendering the page (or during the re-render that Next.js
 * runs after a Server Action's revalidatePath) is surfaced to staff as the
 * opaque "Minified React error #441" with no detail. This boundary catches it,
 * shows the real message, and offers a retry so the page is recoverable.
 */
export default function InvoiceReviewError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  React.useEffect(() => {
    console.error("[v0] invoice review render error:", error)
  }, [error])

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-6 px-4 text-center">
      <Card className="flex w-full flex-col items-center gap-4 p-8">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-lg font-semibold text-foreground text-balance">Could not load this invoice</h1>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            {error?.message || "Something went wrong while rendering the invoice. Your data has not been lost."}
          </p>
          {error?.digest ? (
            <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button onClick={() => reset()}>
            <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
          <Button variant="outline" onClick={() => router.push("/purchasing/invoices")}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Back to invoices
          </Button>
        </div>
      </Card>
    </div>
  )
}
