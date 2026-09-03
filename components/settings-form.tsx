"use client"

import { useState, useTransition } from "react"
import { Card, Button, Input, Label, Textarea } from "@/components/ui"
import { saveSettings } from "@/lib/actions-crm"
import type { Settings } from "@/lib/settings"
import { Check, Loader2 } from "lucide-react"

export function SettingsForm({ settings }: { settings: Settings }) {
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)

  return (
    <form
      action={(fd) =>
        start(async () => {
          await saveSettings(fd)
          setSaved(true)
          setTimeout(() => setSaved(false), 2500)
        })
      }
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
              placeholder="e.g. Thank you for choosing SHWURX Garage. Payment due within 7 days."
              className="min-h-16"
            />
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
            {saved ? "Saved" : "Save settings"}
          </Button>
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
