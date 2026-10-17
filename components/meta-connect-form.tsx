"use client"

import { useActionState } from "react"
import { Link2, Loader2 } from "lucide-react"
import { connectMeta, type MetaConnectState } from "@/lib/actions-meta-import"

export function MetaConnectForm({ needed }: { needed: boolean }) {
  const [state, action, pending] = useActionState<MetaConnectState | null, FormData>(connectMeta, null)

  return (
    <details open={needed} className="rounded-lg border border-border bg-muted/40 p-3">
      <summary className="cursor-pointer text-sm font-medium text-foreground">
        {needed ? "Reconnect Meta (one time)" : "Replace Meta token"}
      </summary>
      <form action={action} className="mt-3 flex flex-col gap-2">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Paste any token from Meta (Graph API Explorer is fine, even the 1-hour one). The CRM swaps it for a permanent
          Page token and saves it, so you do not have to do this again.
        </p>
        <label htmlFor="meta-token" className="sr-only">
          Meta access token
        </label>
        <input
          id="meta-token"
          name="token"
          type="password"
          required
          autoComplete="off"
          placeholder="EAAG…"
          className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
          {pending ? "Connecting…" : "Connect permanently"}
        </button>
        <p role="status" aria-live="polite" className="text-xs leading-relaxed">
          {state?.ok === true ? (
            <span className="text-primary">
              Connected to {state.pages.join(", ")}
              {state.permanent ? " with a token that never expires" : ""}. {state.imported} new lead
              {state.imported === 1 ? "" : "s"} imported.
            </span>
          ) : state?.ok === false ? (
            <span className="text-destructive">{state.error}</span>
          ) : null}
        </p>
      </form>
    </details>
  )
}
