"use client"

import { useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Button, Field, Input, Label } from "@/components/ui"
import { submitAppointment, track } from "@/lib/site-track"
import { SITE_SERVICES } from "@/lib/site-services"

type Status = "idle" | "submitting" | "done" | "error"

export function AppointmentForm() {
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (status === "submitting") return
    setStatus("submitting")
    setError(null)
    const fd = new FormData(e.currentTarget)
    try {
      await submitAppointment({
        name: fd.get("name"),
        phone: fd.get("phone"),
        email: fd.get("email") || null,
        vehicleMake: fd.get("vehicleMake") || null,
        vehicleModel: fd.get("vehicleModel") || null,
        vehicleYear: fd.get("vehicleYear") || null,
        plateNumber: fd.get("plateNumber") || null,
        serviceInterest: fd.get("serviceInterest") || null,
        preferredDate: fd.get("preferredDate") || null,
        preferredTime: fd.get("preferredTime") || null,
        notes: fd.get("notes") || null,
        source: "website",
      })
      track("appointment_request", { service: fd.get("serviceInterest") || null })
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
        <h2 className="mt-4 text-xl font-bold">Request received</h2>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
          Thank you. Our team will call you shortly to confirm your appointment time. Keep your phone handy.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-card p-6 md:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="name" className="sm:col-span-2">
          <Input id="name" name="name" required placeholder="Your name" />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" required placeholder="05x xxx xxxx" />
        </Field>
        <Field label="Email (optional)" htmlFor="email">
          <Input id="email" name="email" type="email" placeholder="you@email.com" />
        </Field>
        <Field label="Car make" htmlFor="vehicleMake">
          <Input id="vehicleMake" name="vehicleMake" placeholder="e.g. Toyota" />
        </Field>
        <Field label="Car model" htmlFor="vehicleModel">
          <Input id="vehicleModel" name="vehicleModel" placeholder="e.g. Land Cruiser" />
        </Field>
        <Field label="Year" htmlFor="vehicleYear">
          <Input id="vehicleYear" name="vehicleYear" inputMode="numeric" placeholder="2021" />
        </Field>
        <Field label="Plate number" htmlFor="plateNumber">
          <Input id="plateNumber" name="plateNumber" placeholder="A 12345" />
        </Field>
        <Field label="Service needed" htmlFor="serviceInterest" className="sm:col-span-2">
          <select
            id="serviceInterest"
            name="serviceInterest"
            defaultValue=""
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Select a service…</option>
            {SITE_SERVICES.map((s) => (
              <option key={s.slug} value={s.title}>{s.title}</option>
            ))}
            <option value="Other">Other / not sure</option>
          </select>
        </Field>
        <Field label="Preferred date" htmlFor="preferredDate">
          <Input id="preferredDate" name="preferredDate" type="date" />
        </Field>
        <Field label="Preferred time" htmlFor="preferredTime">
          <Input id="preferredTime" name="preferredTime" type="time" />
        </Field>
        <Field label="Anything else? (optional)" htmlFor="notes" className="sm:col-span-2">
          <textarea
            id="notes"
            name="notes"
            rows={3}
            placeholder="Describe the issue or any details…"
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
          "Request Appointment"
        )}
      </Button>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        No payment required. We&apos;ll confirm your slot by phone.
      </p>
    </form>
  )
}
