"use client"

import Link from "next/link"
import useSWR from "swr"
import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, BellRing, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Info, OctagonAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n/provider"
import { interpolate } from "@/lib/i18n/dictionaries"
import { GUIDE_VERSION, getCrmDict, guideTopicsFor, roleLabel } from "@/lib/i18n/crm"
import { markGuideSeen } from "@/lib/actions-guide"
import { CrmModal } from "./crm-modal"
import type { CrmAlert } from "@/app/api/crm/assist/route"

interface AssistData {
  guideSeenVersion: number
  role: string
  name: string
  permissions: string[]
  alerts: CrmAlert[]
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Failed to load")
    return r.json() as Promise<AssistData>
  })

const DISMISS_KEY = "shwurx_dismissed_alerts"
const AUTO_SHOWN_KEY = "shwurx_alerts_auto_shown"

function readDismissed(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(DISMISS_KEY) ?? "[]")
  } catch {
    return []
  }
}

const SEVERITY_STYLE = {
  critical: { icon: OctagonAlert, box: "border-destructive/40 bg-destructive/10", text: "text-destructive" },
  warning: { icon: AlertTriangle, box: "border-primary/40 bg-primary/10", text: "text-primary" },
  info: { icon: Info, box: "border-border bg-secondary/40", text: "text-muted-foreground" },
} as const

export function CrmAssist() {
  const { lang } = useI18n()
  const t = getCrmDict(lang)
  const { data, mutate } = useSWR("/api/crm/assist", fetcher, { refreshInterval: 120_000, revalidateOnFocus: true })

  const [guideOpen, setGuideOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [dismissed, setDismissed] = useState<string[]>([])
  const [autoShown, setAutoShown] = useState(false)

  useEffect(() => setDismissed(readDismissed()), [])

  const alerts = data?.alerts ?? []
  const pending = alerts.filter((a) => !dismissed.includes(a.id))
  const guideDue = !!data && data.guideSeenVersion < GUIDE_VERSION

  // Alerts auto-open at most once per browser session; otherwise they reappear on every page
  // navigation (the shell remounts per page) and interrupt staff mid-form on tablets.
  useEffect(() => {
    if (!data || autoShown) return
    setAutoShown(true)
    if (guideDue) {
      setGuideOpen(true)
      return
    }
    let alreadyShown = false
    try {
      alreadyShown = sessionStorage.getItem(AUTO_SHOWN_KEY) === "1"
      sessionStorage.setItem(AUTO_SHOWN_KEY, "1")
    } catch {}
    if (!alreadyShown && pending.some((a) => a.severity !== "info")) setAlertsOpen(true)
  }, [data, autoShown, guideDue, pending])

  const closeGuide = useCallback(() => {
    setGuideOpen(false)
    if (guideDue) {
      markGuideSeen().then(() => mutate())
      if (pending.length) setAlertsOpen(true)
    }
  }, [guideDue, mutate, pending.length])

  const dismiss = (id: string) => {
    const next = [...dismissed, id]
    setDismissed(next)
    try {
      sessionStorage.setItem(DISMISS_KEY, JSON.stringify(next))
    } catch {}
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setGuideOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <BookOpen className="h-4 w-4" aria-hidden="true" />
        <span className="hidden md:inline">{t.header.help}</span>
        <span className="sr-only md:hidden">{t.header.help}</span>
      </button>
      <button
        type="button"
        onClick={() => setAlertsOpen(true)}
        aria-label={`${t.header.alerts}${pending.length ? ` (${pending.length})` : ""}`}
        className={cn(
          "relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border hover:bg-accent",
          pending.some((a) => a.severity === "critical") ? "text-destructive" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <BellRing className="h-4 w-4" aria-hidden="true" />
        {pending.length > 0 && (
          <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {pending.length}
          </span>
        )}
      </button>

      {data && (
        <GuideModal
          open={guideOpen}
          onClose={closeGuide}
          name={data.name}
          role={data.role}
          permissions={data.permissions}
        />
      )}

      <CrmModal
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        title={t.alerts.heading}
        description={pending.length ? t.alerts.subheading : undefined}
        closeLabel={t.header.closeMenu}
        icon={
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <BellRing className="h-5 w-5" aria-hidden="true" />
          </span>
        }
      >
        {pending.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-primary" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{t.alerts.none}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((alert) => {
              const style = SEVERITY_STYLE[alert.severity]
              const copy = t.alerts.kinds[alert.kind]
              const vars = { minutes: alert.minutes ?? 0, count: alert.count ?? 0 }
              const Icon = style.icon
              return (
                <li key={alert.id} className={cn("flex flex-col gap-3 rounded-xl border p-4", style.box)}>
                  <div className="flex items-start gap-3">
                    <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", style.text)} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-xs font-semibold uppercase tracking-wider", style.text)}>
                        {t.alerts.severity[alert.severity]}
                      </p>
                      <p className="mt-0.5 font-semibold">{copy.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{interpolate(copy.body, vars)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => dismiss(alert.id)}
                      className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      {t.alerts.dismiss}
                    </button>
                    <Link
                      href={alert.href}
                      onClick={() => setAlertsOpen(false)}
                      className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                    >
                      {t.alerts.open}
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CrmModal>
    </>
  )
}

function GuideModal({
  open,
  onClose,
  name,
  role,
  permissions,
}: {
  open: boolean
  onClose: () => void
  name: string
  role: string
  permissions: string[]
}) {
  const { lang, dir } = useI18n()
  const t = getCrmDict(lang)
  const topics = useMemo(() => guideTopicsFor(new Set(permissions), role === "owner"), [permissions, role])
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (open) setStep(0)
  }, [open])

  const topic = t.guide.topics[topics[step]]
  const vars = { name, role: roleLabel(lang, role) }
  const last = step === topics.length - 1
  const BackIcon = dir === "rtl" ? ChevronRight : ChevronLeft
  const NextIcon = dir === "rtl" ? ChevronLeft : ChevronRight

  return (
    <CrmModal
      open={open}
      onClose={onClose}
      title={interpolate(topic.title, vars)}
      description={interpolate(t.guide.stepOf, { n: step + 1, total: topics.length })}
      closeLabel={t.guide.skip}
      icon={
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <BookOpen className="h-5 w-5" aria-hidden="true" />
        </span>
      }
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="me-auto rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t.guide.skip}
          </button>
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              <BackIcon className="h-4 w-4" aria-hidden="true" />
              {t.guide.back}
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? onClose() : setStep((s) => s + 1))}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {last ? t.guide.finish : t.guide.next}
            {!last && <NextIcon className="h-4 w-4" aria-hidden="true" />}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex gap-1" aria-hidden="true">
          {topics.map((key, i) => (
            <span key={key} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-primary" : "bg-secondary")} />
          ))}
        </div>
        <p className="leading-relaxed text-foreground">{interpolate(topic.body, vars)}</p>
        <ul className="flex flex-col gap-2">
          {topic.tips.map((tip) => (
            <li key={tip} className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              {tip}
            </li>
          ))}
        </ul>
      </div>
    </CrmModal>
  )
}
