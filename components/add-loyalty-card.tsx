"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Plus, X } from "lucide-react"
import { Button, Input } from "@/components/ui"
import { createCardForCustomer, searchCustomersForCard, type CustomerMatch } from "@/lib/actions-loyalty-cards"

export function AddLoyaltyCard() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<CustomerMatch[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function search(value: string) {
    setQuery(value)
    setError(null)
    if (value.trim().length < 2) {
      setResults([])
      return
    }
    startTransition(async () => {
      const res = await searchCustomersForCard(value)
      if (res.ok) setResults(res.data)
      else setError(res.error)
    })
  }

  function choose(c: CustomerMatch) {
    startTransition(async () => {
      const res = await createCardForCustomer(c.id)
      if (res.ok) router.push(`/loyalty/cards/${res.data}`)
      else setError(res.error)
    })
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" />
        Add card
      </Button>
    )
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:w-80">
      <div className="flex items-center gap-2">
        <label htmlFor="add-card-search" className="sr-only">
          Find customer
        </label>
        <Input
          id="add-card-search"
          autoFocus
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="Customer name or mobile"
        />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {pending && results.length === 0 ? <p className="text-xs text-muted-foreground">Searching...</p> : null}
      <ul className="flex flex-col">
        {results.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              disabled={pending}
              onClick={() => choose(c)}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
            >
              <span className="flex flex-col">
                <span className="font-medium">{c.name}</span>
                {c.mobile ? <span className="text-xs text-muted-foreground">{c.mobile}</span> : null}
              </span>
              <span className="text-xs text-primary">{c.hasCard ? "Open card" : "Create card"}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
