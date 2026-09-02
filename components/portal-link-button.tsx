"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui"
import { issuePortalToken, revokePortalTokens } from "@/lib/actions-portal"
import { Share2, Copy, Check, Ban } from "lucide-react"

export function PortalLinkButton({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()

  function generate() {
    start(async () => {
      const { path } = await issuePortalToken(customerId)
      setUrl(`${window.location.origin}${path}`)
      setOpen(true)
      setCopied(false)
    })
  }

  function revoke() {
    start(async () => {
      await revokePortalTokens(customerId)
      setUrl(null)
      setOpen(false)
    })
  }

  async function copy() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={generate} disabled={pending}>
        <Share2 className="h-4 w-4" /> {pending ? "Generating…" : "Portal Link"}
      </Button>

      {open && url && (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl border border-border bg-card p-4 shadow-lg">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Secure read-only tracking link (valid 30 days). Share it with the customer.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url}
              className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            />
            <Button size="sm" onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={revoke}
              disabled={pending}
              className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
            >
              <Ban className="h-3.5 w-3.5" /> Revoke all links
            </button>
            <button onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
