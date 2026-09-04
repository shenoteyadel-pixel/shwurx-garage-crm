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
              placeholder="e.g. Thank you for choosing SHWURX Auto Service Center. Payment due within 7 days."
              className="min-h-16"
            />
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
