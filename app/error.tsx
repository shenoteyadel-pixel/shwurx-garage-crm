"use client"

import * as React from "react"
import Link from "next/link"
import { Card, Button } from "@/components/ui"
import { AlertTriangle, RotateCw, Home } from "lucide-react"

/**
 * App-wide error boundary. Before this existed, any uncaught render error
 * anywhere in the app reached the browser only as the opaque "Minified React
 * error #441", giving staff no idea what went wrong. This shows the real
 * message and a way to recover.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error("[v0] app render error:", error)
  }, [error])

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-6 px-4 text-center">
      <Card className="flex w-full flex-col items-center gap-4 p-8">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-lg font-semibold text-foreground text-balance">Something went wrong</h1>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            {error?.message || "An unexpected error occurred. Please try again."}
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
          <Button asChild variant="outline">
            <Link href="/">
              <Home className="mr-2 h-4 w-4" aria-hidden="true" />
              Go home
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  )
}
