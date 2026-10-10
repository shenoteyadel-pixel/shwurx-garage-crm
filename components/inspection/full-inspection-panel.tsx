"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, Button, Input, Label, Textarea } from "@/components/ui"
import { cn } from "@/lib/utils"
import { saveFullInspection } from "@/lib/actions-full-inspection"
import {
  CHECK_STATUSES,
  CHECK_STATUS_MAP,
  FULL_INSPECTION_SECTIONS,
  checklistTally,
  type Checklist,
  type CheckStatus,
} from "@/lib/full-inspection-config"
import { ClipboardCheck, FileDown, Loader2, Check, ChevronDown, MessageSquarePlus, RotateCcw } from "lucide-react"

export type FullInspectionData = {
  status: "in_progress" | "completed"
  checklist: Checklist
  summary: string | null
  recommendations: string | null
  odometer: number | null
  completed_at: string | null
}

export function FullInspectionPanel({
  jobId,
  inspection,
  defaultOdometer,
  printHref,
}: {
  jobId: string
  inspection: FullInspectionData | null
  defaultOdometer: number | null
  printHref: string
}) {
  const router = useRouter()
  const [checklist, setChecklist] = React.useState<Checklist>(inspection?.checklist ?? {})
  const [summary, setSummary] = React.useState(inspection?.summary ?? "")
  const [recommendations, setRecommendations] = React.useState(inspection?.recommendations ?? "")
  const [odometer, setOdometer] = React.useState(String(inspection?.odometer ?? defaultOdometer ?? ""))
  const [openNotes, setOpenNotes] = React.useState<Set<string>>(
    () => new Set(Object.entries(inspection?.checklist ?? {}).filter(([, v]) => v.note).map(([k]) => k)),
  )
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set())
  const [dirty, setDirty] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const completed = inspection?.status === "completed"
  const tally = checklistTally(checklist)
  const done = tally.total - tally.pending

  function setStatus(key: string, status: CheckStatus) {
    setChecklist((prev) => {
      const current = prev[key]
      const next = current?.status === status ? null : status
      return { ...prev, [key]: { status: next, note: current?.note ?? "" } }
    })
    setDirty(true)
  }

  function setNote(key: string, note: string) {
    setChecklist((prev) => ({ ...prev, [key]: { status: prev[key]?.status ?? null, note } }))
    setDirty(true)
  }

  function markSectionGood(sectionKey: string) {
    const section = FULL_INSPECTION_SECTIONS.find((s) => s.key === sectionKey)
    if (!section) return
    setChecklist((prev) => {
      const next = { ...prev }
      for (const item of section.items) {
        if (!next[item.key]?.status) next[item.key] = { status: "good", note: next[item.key]?.note ?? "" }
      }
      return next
    })
    setDirty(true)
  }

  function persist(complete?: boolean) {
    setError(null)
    startTransition(async () => {
      try {
        await saveFullInspection({
          jobId,
          checklist,
          summary,
          recommendations,
          odometer: odometer ? Number(odometer) : null,
          complete,
        })
        setDirty(false)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save the inspection")
      }
    })
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <ClipboardCheck className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-semibold">Full vehicle inspection</h2>
            <p className="text-sm text-muted-foreground">
              {completed ? "Report completed and ready for the customer." : `${done} of ${tally.total} points checked`}
            </p>
          </div>
        </div>
        {inspection && (
          <Link
            href={printHref}
            target="_blank"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
          >
            <FileDown className="h-4 w-4" aria-hidden /> Download report
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-3 border-b border-border p-5">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          {(["good", "attention", "urgent", "na"] as const).map((s) =>
            tally[s] > 0 ? (
              <span
                key={s}
                style={{ width: `${(tally[s] / tally.total) * 100}%`, backgroundColor: CHECK_STATUS_MAP[s].hex }}
              />
            ) : null,
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {CHECK_STATUSES.map((s) => (
            <span key={s.value} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.hex }} />
              {s.label} <span className="font-semibold tabular-nums text-foreground">{tally[s.value]}</span>
            </span>
          ))}
          <span className="tabular-nums">Not checked {tally.pending}</span>
        </div>
      </div>

      <div className="flex flex-col divide-y divide-border">
        {FULL_INSPECTION_SECTIONS.map((section) => {
          const isCollapsed = collapsed.has(section.key)
          const sectionDone = section.items.filter((i) => checklist[i.key]?.status).length
          return (
            <section key={section.key} aria-labelledby={`fi-${section.key}`}>
              <div className="flex items-center justify-between gap-3 bg-muted/30 px-5 py-3">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((prev) => {
                      const next = new Set(prev)
                      if (next.has(section.key)) next.delete(section.key)
                      else next.add(section.key)
                      return next
                    })
                  }
                  aria-expanded={!isCollapsed}
                  className="flex min-w-0 items-center gap-2 text-left"
                >
                  <ChevronDown
                    className={cn("h-4 w-4 shrink-0 transition-transform", isCollapsed && "-rotate-90")}
                    aria-hidden
                  />
                  <h3 id={`fi-${section.key}`} className="truncate text-sm font-semibold">
                    {section.title}
                  </h3>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {sectionDone}/{section.items.length}
                  </span>
                </button>
                {!completed && sectionDone < section.items.length && (
                  <button
                    type="button"
                    onClick={() => markSectionGood(section.key)}
                    className="shrink-0 text-xs font-medium text-primary hover:underline"
                  >
                    Mark rest OK
                  </button>
                )}
              </div>

              {!isCollapsed && (
                <ul className="flex flex-col divide-y divide-border/60">
                  {section.items.map((item) => {
                    const entry = checklist[item.key]
                    const noteOpen = openNotes.has(item.key)
                    return (
                      <li key={item.key} className="flex flex-col gap-2 px-5 py-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <span className="text-sm leading-relaxed">{item.label}</span>
                          <div className="flex items-center gap-1.5">
                            <div role="radiogroup" aria-label={item.label} className="flex gap-1">
                              {CHECK_STATUSES.map((s) => {
                                const active = entry?.status === s.value
                                return (
                                  <button
                                    key={s.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={active}
                                    title={s.label}
                                    disabled={completed}
                                    onClick={() => setStatus(item.key, s.value)}
                                    className={cn(
                                      "h-8 min-w-12 rounded-md border px-2 text-xs font-semibold transition disabled:cursor-not-allowed",
                                      active
                                        ? "text-primary-foreground"
                                        : "border-border text-muted-foreground hover:text-foreground",
                                    )}
                                    style={active ? { backgroundColor: s.hex, borderColor: s.hex } : undefined}
                                  >
                                    {s.short}
                                  </button>
                                )
                              })}
                            </div>
                            <button
                              type="button"
                              aria-label={`Add note for ${item.label}`}
                              aria-pressed={noteOpen}
                              onClick={() =>
                                setOpenNotes((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(item.key)) next.delete(item.key)
                                  else next.add(item.key)
                                  return next
                                })
                              }
                              className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground",
                                (noteOpen || entry?.note) && "text-primary",
                              )}
                            >
                              <MessageSquarePlus className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                        </div>
                        {noteOpen && (
                          <Input
                            value={entry?.note ?? ""}
                            onChange={(e) => setNote(item.key, e.target.value)}
                            disabled={completed}
                            maxLength={500}
                            placeholder="Finding, measurement or recommendation (e.g. pads 3 mm, replace within 2,000 km)"
                            aria-label={`Note for ${item.label}`}
                          />
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
      </div>

      <div className="flex flex-col gap-4 border-t border-border p-5">
        <div className="max-w-48">
          <Label htmlFor="fi-odometer">Odometer (km)</Label>
          <Input
            id="fi-odometer"
            type="number"
            min="0"
            value={odometer}
            disabled={completed}
            onChange={(e) => {
              setOdometer(e.target.value)
              setDirty(true)
            }}
          />
        </div>
        <div>
          <Label htmlFor="fi-summary">Inspector summary</Label>
          <Textarea
            id="fi-summary"
            value={summary}
            disabled={completed}
            onChange={(e) => {
              setSummary(e.target.value)
              setDirty(true)
            }}
            placeholder="Overall condition of the vehicle in plain language for the customer."
          />
        </div>
        <div>
          <Label htmlFor="fi-recs">Recommendations</Label>
          <Textarea
            id="fi-recs"
            value={recommendations}
            disabled={completed}
            onChange={(e) => {
              setRecommendations(e.target.value)
              setDirty(true)
            }}
            placeholder="What the customer should do next, in order of priority."
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {completed ? (
            <>
              <Link
                href={printHref}
                target="_blank"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <FileDown className="h-4 w-4" aria-hidden /> Download inspection report
              </Link>
              <Button variant="outline" onClick={() => persist(false)} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Reopen to
                edit
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => persist()} disabled={pending || !dirty}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save progress
              </Button>
              <Button onClick={() => persist(true)} disabled={pending || done === 0}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Complete
                inspection
              </Button>
              {tally.pending > 0 && done > 0 && (
                <span className="text-xs text-muted-foreground">
                  {tally.pending} point{tally.pending === 1 ? "" : "s"} not checked will show as {'"Not inspected"'}.
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  )
}
