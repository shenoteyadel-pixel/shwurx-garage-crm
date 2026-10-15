"use client"

import { useState } from "react"
import { Check, Copy, Eye, EyeOff } from "lucide-react"

export function CopyValue({ label, value, masked = false }: { label: string; value: string; masked?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const hidden = masked && !revealed
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5">
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground" aria-label={hidden ? `${label} hidden` : undefined}>
          {hidden ? "••••••••••••••••••••••••" : value}
        </code>
        {masked ? (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
            aria-pressed={revealed}
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        ) : null}
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
