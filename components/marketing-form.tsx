"use client"

import { useState, useTransition } from "react"
import { Card, Button, Input, Label } from "@/components/ui"
import { saveMarketingSettings } from "@/lib/actions-crm"
import type { Settings } from "@/lib/settings"
import { Check, Loader2, ShieldCheck, BarChart3, Tag, Facebook } from "lucide-react"

// Marketing / website integrations dashboard. Non-technical staff (or an agency
// user on the "marketing" role) paste the IDs their platforms give them; the
// SiteTracking component injects the matching scripts on every page. No code,
// no deploy required — just Save.
export function MarketingForm({ settings, canManage }: { settings: Settings; canManage: boolean }) {
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)
  const [enabled, setEnabled] = useState(settings.tracking_enabled)

  return (
    <form
      action={(fd) =>
        start(async () => {
          await saveMarketingSettings(fd)
          setSaved(true)
          setTimeout(() => setSaved(false), 2500)
        })
      }
      className="flex flex-col gap-5"
    >
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Website tracking
            </h2>
            <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">
              Master switch. When off, no analytics or pixel scripts load anywhere on the site — useful while testing or
              if you pause a campaign.
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="tracking_enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={!canManage}
              className="h-4 w-4 accent-primary"
            />
            <span className="font-medium">{enabled ? "Enabled" : "Disabled"}</span>
          </label>
        </div>
      </Card>

      <Card className="p-6">
        <SectionTitle icon={ShieldCheck} title="Google Search Console" />
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
          Verifies ownership of the site so it can appear in Google Search. In Search Console choose the{" "}
          <strong>HTML tag</strong> method and paste the token here — you can paste the whole{" "}
          <code className="rounded bg-muted px-1">{"<meta …>"}</code> tag and we&apos;ll extract the token.
        </p>
        <Field
          label="Verification token"
          name="google_site_verification"
          defaultValue={settings.google_site_verification}
          placeholder="e.g. Lp1a2B3c4D5e6F7g8H9i0J…"
          disabled={!canManage}
        />
      </Card>

      <Card className="p-6">
        <SectionTitle icon={BarChart3} title="Google Analytics 4" />
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
          Tracks visitors, traffic sources and conversions. Paste your <strong>Measurement ID</strong> from Google
          Analytics (Admin → Data streams).
        </p>
        <Field
          label="Measurement ID"
          name="ga4_measurement_id"
          defaultValue={settings.ga4_measurement_id}
          placeholder="G-XXXXXXXXXX"
          disabled={!canManage}
        />
      </Card>

      <Card className="p-6">
        <SectionTitle icon={Tag} title="Google Tag Manager" />
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
          Lets the marketing team add and manage tags (conversions, remarketing, custom events) without touching the
          site again. Paste your <strong>Container ID</strong>.
        </p>
        <Field
          label="Container ID"
          name="gtm_container_id"
          defaultValue={settings.gtm_container_id}
          placeholder="GTM-XXXXXXX"
          disabled={!canManage}
        />
      </Card>

      <Card className="p-6">
        <SectionTitle icon={Facebook} title="Meta Pixel (Facebook / Instagram)" />
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
          Measures results from Facebook &amp; Instagram ads and builds audiences for remarketing. Paste your{" "}
          <strong>Pixel ID</strong> from Meta Events Manager.
        </p>
        <Field
          label="Pixel ID"
          name="meta_pixel_id"
          defaultValue={settings.meta_pixel_id}
          placeholder="e.g. 123456789012345"
          disabled={!canManage}
        />
      </Card>

      {canManage ? (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
            {saved ? "Saved" : "Save integrations"}
          </Button>
          <p className="text-xs text-muted-foreground">Changes go live on the site immediately after saving.</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">You have read-only access to these integrations.</p>
      )}
    </form>
  )
}

function SectionTitle({ icon: Icon, title }: { icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <h2 className="text-sm font-semibold">{title}</h2>
    </div>
  )
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  disabled,
}: {
  label: string
  name: string
  defaultValue: string | null
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={defaultValue ?? ""} placeholder={placeholder} disabled={disabled} />
    </div>
  )
}
