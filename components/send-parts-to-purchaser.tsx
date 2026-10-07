"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Send, CheckCircle2 } from "lucide-react"
import { Button, Card } from "@/components/ui"
import { releasePartsToPurchaser } from "@/lib/actions-approvals"

export function SendPartsToPurchaser({
  jobId,
  pendingCount,
  releasedCount,
  canSend,
}: {
  jobId: string
  pendingCount: number
  releasedCount: number
  canSend: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  if (pendingCount === 0) {
    if (releasedCount === 0) return null
    return (
      <Card className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
        All approved parts have been sent to the purchaser.
      </Card>
    )
  }

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {pendingCount} approved part{pendingCount === 1 ? "" : "s"} waiting to go to the purchaser
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {canSend
            ? "Check the list, then send it so purchasing can order."
            : "A service advisor needs to send these to purchasing."}
        </p>
        {message && (
          <p className="mt-1 text-xs text-red-300" role="alert">
            {message}
          </p>
        )}
      </div>
      {canSend && (
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setMessage(null)
              const res = await releasePartsToPurchaser(jobId)
              if (!res.ok) setMessage(res.error ?? "Could not send parts.")
              router.refresh()
            })
          }
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          {pending ? "Sending..." : "Send to purchaser"}
        </Button>
      )}
    </Card>
  )
}
