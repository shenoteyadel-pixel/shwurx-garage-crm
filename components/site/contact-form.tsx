"use client"

import { useState } from "react"
import { CheckCircle2, Loader2, Send } from "lucide-react"
import { Button, Field, Input, Textarea } from "@/components/ui"
import { submitLead, track } from "@/lib/site-track"
import { useI18n } from "@/lib/i18n/provider"

type Status = "idle" | "submitting" | "done" | "error"

export function ContactForm({ heading, sub }: { heading?: string; sub?: string }) {
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
      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-border bg-card p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
        </div>
        <h2 className="mt-5 text-2xl font-bold tracking-tight">{t.doneTitle}</h2>
        <p className="mt-2 max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">{t.doneBody}</p>
      </div>
    )
  }

  return (
    <div className="rounded-3xl border border-border bg-card shadow-xl shadow-black/5">
      {(heading || sub) && (
        <div className="border-b border-border px-6 py-6 md:px-8">
          {heading && <h2 className="text-xl font-bold tracking-tight md:text-2xl">{heading}</h2>}
          {sub && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{sub}</p>}
        </div>
      )}

      <form onSubmit={onSubmit} className="px-6 py-6 md:px-8 md:py-8">
        <div className="grid gap-5">
          <Field label={t.name} htmlFor="name">
            <Input id="name" name="name" placeholder={t.namePlaceholder} className="h-11" />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t.phone} htmlFor="phone">
              <Input id="phone" name="phone" type="tel" placeholder={t.phonePlaceholder} dir="ltr" className="h-11" />
            </Field>
            <Field label={t.email} htmlFor="email">
              <Input id="email" name="email" type="email" placeholder={t.emailPlaceholder} dir="ltr" className="h-11" />
            </Field>
          </div>
          <Field label={t.message} htmlFor="message">
            <Textarea id="message" name="message" rows={5} placeholder={t.messagePlaceholder} className="min-h-32" />
          </Field>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="mt-6 w-full" disabled={status === "submitting"}>
          {status === "submitting" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> {t.sending}
            </>
          ) : (
            <>
              <Send className="h-4 w-4" /> {t.send}
            </>
          )}
        </Button>
      </form>
    </div>
  )
}
