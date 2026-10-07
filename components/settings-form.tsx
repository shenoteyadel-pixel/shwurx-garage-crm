"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { Card, Button, Input, Label, Textarea } from "@/components/ui"
import { saveSettings } from "@/lib/actions-crm"
import type { Settings } from "@/lib/settings"
import { AlertCircle, Check, Loader2 } from "lucide-react"

type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error" | "invalid"

const AUTOSAVE_DELAY_MS = 1200

export function SettingsForm({ settings }: { settings: Settings }) {
  const formRef = useRef<HTMLFormElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pending, start] = useTransition()
  const [status, setStatus] = useState<SaveStatus>("idle")
  const [error, setError] = useState<string | null>(null)

  const save = (fd: FormData) =>
    start(async () => {
      setStatus("saving")
      try {
        await saveSettings(fd)
        setError(null)
        setStatus("saved")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save")
        setStatus("error")
      }
    })

  const flush = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    const form = formRef.current
    if (!form) return
    if (!form.checkValidity()) {
      setStatus("invalid")
      return
    }
    save(new FormData(form))
  }

  const schedule = () => {
    setStatus("pending")
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flush, AUTOSAVE_DELAY_MS)
  }

  // Save anything still waiting when the user leaves the page.
  useEffect(() => {
    const onHide = () => {
      if (timerRef.current) flush()
    }
    window.addEventListener("pagehide", onHide)
    return () => {
      window.removeEventListener("pagehide", onHide)
      if (timerRef.current) flush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <form
      ref={formRef}
      data-autosave
      onInput={schedule}
      onChange={schedule}
      onBlur={() => {
        if (timerRef.current) flush()
      }}
      action={(fd) => {
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = null
        save(fd)
      }}
    >
      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Identity</h2>
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
          The legal name, Trade License, and TRN appear on all official documents (Tax Invoice, Approval Certificate).
          These are legally required — keep them accurate.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Legal / registered name"
            name="legal_name"
            defaultValue={settings.legal_name}
            placeholder="SHENOTEY ESKANDER AUTOMOTIVE CENTER"
            required
          />
          <Field label="Company name (display / brand)" name="company_name" defaultValue={settings.company_name} required />
          <Field label="Trade License No." name="trade_license" defaultValue={settings.trade_license} placeholder="1033544" />
          <Field
            label="Tax Registration Number (TRN)"
            name="trn"
            defaultValue={settings.trn}
            placeholder="10044045860003"
          />
          <Field label="Logo URL (optional)" name="logo_url" defaultValue={settings.logo_url} />
        </div>

        <h2 className="mb-4 mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Contact</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" name="phone" defaultValue={settings.phone} />
          <Field label="Email" name="email" type="email" defaultValue={settings.email} />
          <Field label="Website" name="website" defaultValue={settings.website} />
          <div>
            <Label htmlFor="address">Address</Label>
            <Textarea id="address" name="address" defaultValue={settings.address ?? ""} className="min-h-16" />
          </div>
        </div>

        <h2 className="mb-4 mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Defaults</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Default labour rate (AED/hr)"
            name="labour_rate_default"
            type="number"
            defaultValue={settings.labour_rate_default}
          />
          <Field
            label="Quotation validity (days)"
            name="quotation_validity_days"
            type="number"
            defaultValue={settings.quotation_validity_days}
          />
          <div className="sm:col-span-2">
            <Label htmlFor="footer_note">Document footer note</Label>
            <Textarea
              id="footer_note"
              name="footer_note"
              defaultValue={settings.footer_note ?? ""}
              placeholder="e.g. Thank you for choosing SHWURX Auto Service Center. Payment due within 7 days."
              className="min-h-16"
            />
          </div>
        </div>

        <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Parts pricing &amp; VAT
        </h2>
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
          Used to suggest sale prices when parts are added from a captured supplier invoice. You can always override the
          price per line before confirming.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="pricing_method">Pricing method</Label>
            <select
              id="pricing_method"
              name="pricing_method"
              defaultValue={settings.pricing_method}
              className="h-10 w-full rounded-lg border border-input bg-background/60 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="markup">Markup on cost</option>
              <option value="margin">Target margin</option>
            </select>
          </div>
          <Field label="Default markup / margin %" name="default_markup_pct" type="number" defaultValue={settings.default_markup_pct} />
          <Field label="VAT rate %" name="vat_rate" type="number" defaultValue={settings.vat_rate} />
          <div className="sm:col-span-2">
            <Label htmlFor="parts_release_mode">After the customer approves parts</Label>
            <select
              id="parts_release_mode"
              name="parts_release_mode"
              defaultValue={settings.parts_release_mode}
              className="h-10 w-full rounded-lg border border-input bg-background/60 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="auto">Send to purchaser automatically</option>
              <option value="advisor">Service advisor sends to purchaser</option>
            </select>
          </div>
        </div>

        <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Customer tracking
        </h2>
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
          A customer&apos;s tracking link never expires while their vehicle is still with you. This setting only controls
          how long the link stays available <strong>after the job is delivered</strong>.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Field
              label="Expire tracking after delivery (days)"
              name="tracking_expire_after_delivery_days"
              type="number"
              defaultValue={settings.tracking_expire_after_delivery_days}
            />
            <p className="mt-1 text-xs text-muted-foreground">Set to 0 to keep tracking links available forever.</p>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save now
          </Button>
          <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {status === "pending" && "Changes will save automatically…"}
            {status === "saving" && (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving…
              </>
            )}
            {status === "saved" && (
              <>
                <Check className="h-4 w-4 text-primary" /> All changes saved
              </>
            )}
            {status === "invalid" && (
              <>
                <AlertCircle className="h-4 w-4 text-destructive" /> Fill the required fields to save
              </>
            )}
            {status === "error" && (
              <>
                <AlertCircle className="h-4 w-4 text-destructive" /> Not saved: {error}
              </>
            )}
            {status === "idle" && "Settings save automatically as you type"}
          </p>
        </div>
      </Card>
    </form>
  )
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required,
  placeholder,
}: {
  label: string
  name: string
  defaultValue: string | number | null
  type?: string
  required?: boolean
  placeholder?: string
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
        placeholder={placeholder}
      />
    </div>
  )
}
