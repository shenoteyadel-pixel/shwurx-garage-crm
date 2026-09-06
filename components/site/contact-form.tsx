"use client"

import { useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Button, Field, Input } from "@/components/ui"
import { submitLead, track } from "@/lib/site-track"
import { useI18n } from "@/lib/i18n/provider"

type Status = "idle" | "submitting" | "done" | "error"

export function ContactForm() {
  const { dict } = useI18n()
  const t = dict.contactForm
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
      setError(t.errNoContact)
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
      setError(err instanceof Error ? err.message : t.errGeneric)
      setStatus("error")
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
          <CheckCircle2 className="h-7 w-7 text-emerald-400" />
        </div>
        <h2 className="mt-4 text-xl font-bold">{t.doneTitle}</h2>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">{t.doneBody}</p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-card p-6 md:p-8">
      <div className="grid gap-4">
        <Field label={t.name} htmlFor="name">
          <Input id="name" name="name" placeholder={t.namePlaceholder} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.phone} htmlFor="phone">
            <Input id="phone" name="phone" type="tel" placeholder={t.phonePlaceholder} dir="ltr" />
          </Field>
          <Field label={t.email} htmlFor="email">
            <Input id="email" name="email" type="email" placeholder={t.emailPlaceholder} dir="ltr" />
          </Field>
        </div>
        <Field label={t.message} htmlFor="message">
          <textarea
            id="message"
            name="message"
            rows={4}
            placeholder={t.messagePlaceholder}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </Field>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      <Button type="submit" size="lg" className="mt-6 w-full" disabled={status === "submitting"}>
        {status === "submitting" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> {t.sending}
          </>
        ) : (
          t.send
        )}
      </Button>
    </form>
  )
}
