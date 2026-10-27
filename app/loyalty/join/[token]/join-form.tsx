"use client"

import { useActionState } from "react"
import { enrollAction, type EnrollState } from "./actions"

export function JoinForm({ token, firstName }: { token: string; firstName: string }) {
  const [state, formAction, pending] = useActionState<EnrollState, FormData>(enrollAction, { status: "idle" })

  if (state.status === "enrolled" || state.status === "already_active") {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-semibold text-foreground">{"You're in, " + firstName + "."}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Your SWURX Rewards membership is active. Points are added automatically when your invoices are paid.
        </p>
        <a
          href={`/loyalty/join/${token}`}
          className="mt-2 flex h-12 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground"
        >
          Show my card
        </a>
      </div>
    )
  }
  if (state.status === "locked" || state.status === "invalid") {
    return (
      <p role="alert" className="rounded-lg border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground">
        This link can no longer be used. Please ask our service desk to help you join.
      </p>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-2">
        <label htmlFor="last4" className="text-sm font-medium text-foreground">
          Last 4 digits of your mobile number
        </label>
        <input
          id="last4"
          name="last4"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]{4}"
          maxLength={4}
          required
          className="h-12 rounded-md border border-input bg-background px-3 text-center font-mono text-lg tracking-[0.5em] text-foreground"
          aria-describedby={state.message ? "join-error" : undefined}
        />
      </div>
      <label className="flex items-start gap-3 text-sm leading-relaxed text-foreground">
        <input type="checkbox" name="terms" required className="mt-1 h-4 w-4" />
        <span>I agree to the SWURX Rewards terms. Points expire 12 months after they are earned.</span>
      </label>
      <label className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground">
        <input type="checkbox" name="whatsapp" className="mt-1 h-4 w-4" />
        <span>Send me service reminders and rewards updates on WhatsApp. I can opt out at any time.</span>
      </label>
      {state.message && (
        <p id="join-error" role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-60"
      >
        {pending ? "Joining..." : "Join SWURX Rewards"}
      </button>
    </form>
  )
}
