"use client"

import { useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Button, Field, Input } from "@/components/ui"
import { submitLead, track } from "@/lib/site-track"

type Status = "idle" | "submitting" | "done" | "error"

export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (status === "submitting") return
    setStatus("submitting")
    setError(null)
    const fd = new FormData(e.currentTarget)
    const phone = String(fd.get("phone") || "").trim()
    const email = String(fd.get("email") || "").trim()
    if (!phone && !email) {
      setError("Please provide a phone number or email so we can reply.")
      setStatus("error")
      return
    }
    try {
      await submitLead({
        name: fd.get("name") || null,
        phone: phone || null,
        email: email || null,
        message: fd.get("message") || null,
        source: "website",
      })
      track("lead_submit", {})
      setStatus("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
      setStatus("error")
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
          <CheckCircle2 className="h-7 w-7 text-emerald-400" />
        </div>
        <h2 className="mt-4 text-xl font-bold">Message sent</h2>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
          Thanks for reaching out — we&apos;ll get back to you as soon as possible.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-card p-6 md:p-8">
      <div className="grid gap-4">
        <Field label="Name" htmlFor="name">
          <Input id="name" name="name" placeholder="Your name" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" type="tel" placeholder="05x xxx xxxx" />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" placeholder="you@email.com" />
          </Field>
        </div>
        <Field label="Message" htmlFor="message">
          <textarea
            id="message"
            name="message"
            rows={4}
            placeholder="How can we help?"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </Field>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      <Button type="submit" size="lg" className="mt-6 w-full" disabled={status === "submitting"}>
        {status === "submitting" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Sending…
          </>
        ) : (
          "Send Message"
        )}
      </Button>
    </form>
  )
}
