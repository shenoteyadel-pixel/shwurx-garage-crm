"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Loader2, Rocket } from "lucide-react"
import { Badge, Button, Card, Label } from "@/components/ui"
import { publishAnalyticsConfig } from "@/lib/actions-website-analytics"
import type { AnalyticsIssue } from "@/lib/website/analytics"
import type { AnalyticsSectionDTO } from "@/lib/website/control-center-data"
import type { WebsiteDocument } from "@/lib/website/types"
import { AnalyticsSection } from "./analytics-section"

/**
 * Stand-alone analytics editor for marketing staff. It edits only the
 * analytics block and publishes it straight to the live revision; it never
 * sees or publishes the website content draft.
 */
export function AnalyticsEditor({ data, canEdit }: { data: AnalyticsSectionDTO; canEdit: boolean }) {
  const router = useRouter()
  const [config, setConfig] = useState(data.config)
  const [dirty, setDirty] = useState(false)
  const [note, setNote] = useState("")
  const [issues, setIssues] = useState<AnalyticsIssue[] | null>(null)
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null)
  const [pending, start] = useTransition()
  const editCount = useRef(0)
  const [syncedFrom, setSyncedFrom] = useState(data.config)
  // Revisions the local config was based on. Publish compares against these,
  // not the latest props, so a refresh can never rebase stale local edits.
  const [base, setBase] = useState({ draftVersion: data.draftVersion, liveRevisionId: data.liveRevisionId ?? 0 })

  // Adopt the server's latest config after router.refresh() only when there
  // are no pending local edits (mirrors the main builder).
  if (syncedFrom !== data.config) {
    setSyncedFrom(data.config)
    if (!dirty) {
      setConfig(data.config)
      setBase({ draftVersion: data.draftVersion, liveRevisionId: data.liveRevisionId ?? 0 })
    }
  }

  const conflict =
    dirty && (base.draftVersion !== data.draftVersion || base.liveRevisionId !== (data.liveRevisionId ?? 0))

  const reloadLatest = () => {
    editCount.current += 1
    setConfig(data.config)
    setBase({ draftVersion: data.draftVersion, liveRevisionId: data.liveRevisionId ?? 0 })
    setDirty(false)
    setIssues(null)
    setMessage(null)
  }

  const doc = { analytics: config } as WebsiteDocument
  const mutate = (fn: (d: WebsiteDocument) => void) => {
    setConfig((prev) => {
      const next = { analytics: structuredClone(prev) } as WebsiteDocument
      fn(next)
      return next.analytics
    })
    editCount.current += 1
    setDirty(true)
  }

  const blocked = !data.initialised || !data.hasLive

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {data.liveRevisionId && <Badge>Live revision #{data.liveRevisionId}</Badge>}
          <Badge className={config.enabled ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}>
            {config.enabled ? "Tracking switched on" : "Tracking switched off"}
          </Badge>
          {dirty && <Badge className="bg-amber-500/15 text-amber-600">Unpublished changes</Badge>}
          {!data.managed && <span className="text-xs text-muted-foreground">Currently using the older tracking settings.</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          {data.conversionSigningReady
            ? "Ads lead deduplication: signing is configured. Provider delivery still requires verification."
            : "Ads lead deduplication: signing is unavailable. Enquiries still save; Ads lead conversions stay suppressed."}
        </p>
        {blocked ? (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            The website must be imported and published once from Site builder before analytics can be published.
          </p>
        ) : (
          canEdit && (
            <div className="flex flex-col gap-2 md:flex-row md:items-end">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="analytics-note">What changed? (optional)</Label>
                <input
                  id="analytics-note"
                  className="h-10 rounded-lg border border-input bg-background/60 px-3 text-sm"
                  value={note}
                  maxLength={200}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Turned on GTM after QA"
                />
              </div>
              <Button
                disabled={pending || !dirty || conflict}
                onClick={() =>
                  start(async () => {
                    setMessage(null)
                    const sentAt = editCount.current
                    const r = await publishAnalyticsConfig(config, base.draftVersion, base.liveRevisionId, note)
                    if (!r.ok) {
                      setIssues(r.issues ?? null)
                      return setMessage({ tone: "error", text: r.error })
                    }
                    setIssues(null)
                    // Edits typed while publishing were not sent; keep them pending
                    // on top of the revision this publish just created.
                    setBase((prev) => ({
                      draftVersion: r.draftVersion ?? prev.draftVersion,
                      liveRevisionId: r.liveRevisionId ?? prev.liveRevisionId,
                    }))
                    setDirty(editCount.current !== sentAt)
                    setNote("")
                    setMessage({ tone: "ok", text: "Analytics published. Only analytics changed on the live site." })
                    router.refresh()
                  })
                }
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Publish analytics
              </Button>
            </div>
          )
        )}
        {conflict && !blocked && (
          <div role="alert" className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm md:flex-row md:items-center md:justify-between">
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              Someone else changed the website since you started editing. Publishing is paused so their changes aren&apos;t overwritten.
            </p>
            <Button variant="outline" size="sm" onClick={reloadLatest} disabled={pending}>
              Discard my changes and load latest
            </Button>
          </div>
        )}
        {message && (
          <p role="status" className={message.tone === "ok" ? "text-sm text-primary" : "text-sm text-destructive"}>
            {message.text}
          </p>
        )}
        {issues && issues.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-lg bg-muted/40 p-3 text-xs">
            {issues.map((i, n) => (
              <li key={n} className={i.level === "error" ? "text-destructive" : "text-muted-foreground"}>
                {i.message}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="flex flex-col gap-5 p-5">
        <AnalyticsSection doc={doc} mutate={mutate} canEdit={canEdit && !blocked} />
      </Card>
    </div>
  )
}
