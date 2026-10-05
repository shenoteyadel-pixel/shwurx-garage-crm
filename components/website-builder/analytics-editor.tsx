"use client"

import { useState, useTransition } from "react"
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

  const doc = { analytics: config } as WebsiteDocument
  const mutate = (fn: (d: WebsiteDocument) => void) => {
    const next = { analytics: structuredClone(config) } as WebsiteDocument
    fn(next)
    setConfig(next.analytics)
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
                disabled={pending || !dirty}
                onClick={() =>
                  start(async () => {
                    setMessage(null)
                    const r = await publishAnalyticsConfig(config, data.draftVersion, data.liveRevisionId ?? 0, note)
                    if (!r.ok) {
                      setIssues(r.issues ?? null)
                      return setMessage({ tone: "error", text: r.error })
                    }
                    setIssues(null)
                    setDirty(false)
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
