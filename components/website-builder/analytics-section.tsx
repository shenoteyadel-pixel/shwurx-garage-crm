"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, Lock, XCircle } from "lucide-react"
import { Badge, Input, Label } from "@/components/ui"
import {
  CONVERSION_KEYS,
  ID_RULES,
  analyticsIssues,
  normalizeHost,
  resolveRuntime,
  sanitizeAnalytics,
  type AnalyticsConfig,
  type ConversionKey,
  type TagOwner,
} from "@/lib/website/analytics"
import type { WebsiteDocument } from "@/lib/website/types"
import { TextField, Toggle } from "./fields"

const CONVERSION_LABELS: Record<ConversionKey, string> = {
  lead: "Enquiry / contact lead",
  appointment: "Appointment request",
  phone_click: "Phone click",
  whatsapp_click: "WhatsApp click",
}

const OWNER_OPTIONS: { value: TagOwner; label: string; hint: string }[] = [
  { value: "gtm", label: "Google Tag Manager", hint: "GTM loads GA4 and Ads. The site only pushes dataLayer events." },
  { value: "gtag", label: "Direct Google tag", hint: "The site loads GA4/Ads itself. Use only without GTM." },
  { value: "none", label: "No Google tags", hint: "Only first-party analytics and the optional Meta pixel." },
]

type IdKey = keyof typeof ID_RULES

function idState(key: IdKey, value: string): "empty" | "ok" | "invalid" {
  if (!value.trim()) return "empty"
  const v = key === "searchConsoleToken" ? value.trim() : key === "metaPixelId" || key === "adsCustomerId" ? value.trim() : value.trim().toUpperCase()
  return ID_RULES[key].re.test(v) ? "ok" : "invalid"
}

export function AnalyticsSection({
  doc,
  mutate,
  canEdit,
}: {
  doc: WebsiteDocument
  mutate: (fn: (d: WebsiteDocument) => void) => void
  canEdit: boolean
}) {
  const a = doc.analytics
  const set = (fn: (c: AnalyticsConfig) => void) =>
    mutate((d) => {
      fn(d.analytics)
      d.analytics.managed = true
    })

  const diagnostics = useMemo(() => {
    const clean = sanitizeAnalytics({ ...a, managed: true })
    const issues = analyticsIssues(clean)
    const hosts = clean.allowedHosts.length ? clean.allowedHosts : ["(no host allowed)"]
    const runtimes = hosts.map((h) => ({ host: h, rt: resolveRuntime(clean, h, { preview: false, indexable: true }) }))
    return { issues, runtimes }
  }, [a])

  const idField = (key: IdKey, label: string, hint: string) => {
    const value = (a[key] as string) ?? ""
    const st = idState(key, value)
    return (
      <div className="flex flex-col gap-1">
        <TextField
          label={label}
          value={value}
          placeholder={ID_RULES[key].example}
          hint={hint}
          onChange={(v) => set((c) => void ((c[key] as string) = v))}
        />
        {st === "invalid" && (
          <p className="text-xs text-destructive">Not a valid format. Expected like {ID_RULES[key].example}.</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold">Analytics &amp; tracking</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Saved with the draft and goes live only when you publish. Restore and rollback include these settings, so a
          bad tag change can be undone from History.
        </p>
      </div>

      {!canEdit && (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="leading-relaxed text-muted-foreground">
            Read-only. Changing analytics needs the &quot;Manage website tracking&quot; permission; saves that touch
            this section are rejected on the server without it.
          </p>
        </div>
      )}

      <fieldset disabled={!canEdit} className="flex flex-col gap-6 disabled:opacity-80">
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <p className="font-medium">Activation</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Keep this off until the GTM container has been checked in Tag Assistant Preview. While off, no
                third-party script loads anywhere.
              </p>
            </div>
            <Toggle
              label={a.enabled ? "Tracking on" : "Tracking off"}
              checked={a.enabled}
              onChange={(v) => {
                if (v && !confirm("Turn tracking on? Tags load on the allowed production hosts after you publish, once visitors consent.")) return
                set((c) => void (c.enabled = v))
              }}
            />
          </div>
          <Toggle
            label="Ask visitors for consent before any tag stores identifiers (Consent Mode v2)"
            checked={a.consentRequired}
            onChange={(v) => set((c) => void (c.consentRequired = v))}
          />
        </div>

        <div className="flex flex-col gap-3">
          <p className="font-medium">Tag owner</p>
          <div role="radiogroup" aria-label="Tag owner" className="grid gap-2 md:grid-cols-3">
            {OWNER_OPTIONS.map((o) => (
              <label
                key={o.value}
                className={
                  "flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm transition " +
                  (a.owner === o.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40")
                }
              >
                <span className="flex items-center gap-2 font-medium">
                  <input
                    type="radio"
                    name="analytics-owner"
                    className="accent-[var(--primary)]"
                    checked={a.owner === o.value}
                    onChange={() => set((c) => void (c.owner = o.value))}
                  />
                  {o.label}
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">{o.hint}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {idField("gtmId", "GTM container ID", "The only script loaded when GTM is the owner.")}
          {idField("ga4Id", "GA4 measurement ID", a.owner === "gtm" ? "Reference only: configure it inside GTM." : "Loaded directly by the site.")}
          {idField("adsId", "Google Ads conversion ID", a.owner === "gtm" ? "Reference only: configure it inside GTM." : "Loaded directly by the site.")}
          {idField("adsCustomerId", "Google Ads customer ID", "Account reference for your team. Never loaded on the site.")}
          {idField("metaPixelId", "Meta pixel ID", "Optional. Loads only after marketing consent.")}
          {idField("searchConsoleToken", "Search Console verification token", "Paste the token or the whole <meta> tag. Published as a meta tag.")}
        </div>

        <div className="flex flex-col gap-3">
          <p className="font-medium">Conversions</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Each conversion fires once per saved record, after the server confirms it. Event names go to the dataLayer
            (GTM) or GA4; Ads labels are used only by the direct Google tag owner.
          </p>
          <div className="flex flex-col gap-3">
            {CONVERSION_KEYS.map((k) => (
              <div key={k} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[12rem_1fr_1fr] md:items-end">
                <p className="text-sm font-medium">{CONVERSION_LABELS[k]}</p>
                <TextField label="Event name" value={a.events[k]} onChange={(v) => set((c) => void (c.events[k] = v))} />
                <TextField
                  label="Ads conversion label"
                  value={a.adsLabels[k]}
                  placeholder={k === "appointment" ? "Not configured yet" : ""}
                  onChange={(v) => set((c) => void (c.adsLabels[k] = v))}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <HostsField
            key={a.allowedHosts.join(",")}
            hosts={a.allowedHosts}
            onCommit={(list) => set((c) => void (c.allowedHosts = list))}
          />
          <TextField
            label="Attribution retention (days)"
            type="number"
            value={String(a.retentionDays)}
            hint="How long a stored campaign touch (gclid, UTM) stays valid. 1-395."
            onChange={(v) => set((c) => void (c.retentionDays = Number(v) || 0))}
          />
        </div>
      </fieldset>

      <Diagnostics issues={diagnostics.issues} runtimes={diagnostics.runtimes} enabled={a.enabled} />
    </div>
  )
}

function HostsField({ hosts, onCommit }: { hosts: string[]; onCommit: (list: string[]) => void }) {
  const [text, setText] = useState(hosts.join(", "))
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="analytics-hosts">Allowed production hosts</Label>
      <Input
        id="analytics-hosts"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const list = [...new Set(text.split(",").map((h) => normalizeHost(h)).filter(Boolean))]
          if (list.join(",") !== hosts.join(",")) onCommit(list)
        }}
      />
      <p className="text-xs text-muted-foreground">Comma-separated. Tags never load on preview, staging or other domains.</p>
    </div>
  )
}

function Diagnostics({
  issues,
  runtimes,
  enabled,
}: {
  issues: ReturnType<typeof analyticsIssues>
  runtimes: { host: string; rt: ReturnType<typeof resolveRuntime> }[]
  enabled: boolean
}) {
  return (
    <section aria-labelledby="analytics-diagnostics" className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4">
      <h4 id="analytics-diagnostics" className="font-medium">
        Diagnostics
      </h4>
      {issues.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-primary">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Configuration is consistent.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {issues.map((i, n) => (
            <li key={n} className="flex items-start gap-2">
              {i.level === "error" ? (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-label="Error" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Warning" />
              )}
              <span className="leading-relaxed">{i.message}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          After publish, on production{enabled ? "" : " (tracking off)"}
        </p>
        {runtimes.map(({ host, rt }) => (
          <div key={host} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-xs">{host}</span>
            {rt.gtmId && <Badge>GTM {rt.gtmId}</Badge>}
            {rt.ga4Id && <Badge>GA4 {rt.ga4Id}</Badge>}
            {rt.adsId && <Badge>Ads {rt.adsId}</Badge>}
            {rt.metaPixelId && <Badge>Meta pixel</Badge>}
            {!rt.thirdParty && <span className="text-xs text-muted-foreground">No third-party tags: {rt.blockedBy.join("; ") || "none configured"}</span>}
          </div>
        ))}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Tags never load on editor preview, admin, CRM or customer-portal routes, and only after consent when consent is
          required.
        </p>
      </div>
    </section>
  )
}
