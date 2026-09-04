"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { Button, Input } from "@/components/ui"

/**
 * Accepts either a raw tracking code or a full pasted tracking link and routes
 * the visitor to /track/<token>. The token page validates the code itself.
 */
export function TrackEntry() {
  const router = useRouter()
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const raw = value.trim()
    if (!raw) {
      setError("Enter your tracking code to continue.")
      return
    }
    // Allow pasting a full link — extract the last path segment as the token.
    let token = raw
    const match = raw.match(/\/track\/([^/?#]+)/i)
    if (match) token = match[1]
    else if (raw.includes("/")) token = raw.split("/").filter(Boolean).pop() || raw
    router.push(`/track/${encodeURIComponent(token)}`)
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          placeholder="Enter your tracking code or link"
          aria-label="Tracking code"
          className="h-12 flex-1"
        />
        <Button type="submit" size="lg" className="shrink-0">
          Track <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </form>
  )
}
