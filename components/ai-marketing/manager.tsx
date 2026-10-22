"use client"

import * as React from "react"
import { Megaphone, ShieldCheck } from "lucide-react"
import { useI18n } from "@/lib/i18n/provider"
import { cn } from "@/lib/utils"
import { Badge, Card } from "@/components/ui"
import { getAiMarketingStrings } from "@/components/ai-marketing/strings"
import {
  AI_MARKETING_SECTIONS,
  type ActionLogEntry,
  type AiMarketingSection,
  type AttributionReport,
  type CheckType,
  type ExecutionSetting,
  type IntegrationCheck,
  type LiveResult,
  type MarketingRecommendation,
  type MarketingRecommendationEvent,
  type PlatformPerformance,
} from "@/lib/ai-marketing/types"
import {
  OverviewSection,
  PlatformSection,
  RecommendationsSection,
  ApprovalQueueSection,
  HistorySection,
  SettingsSection,
} from "@/components/ai-marketing/sections"

export interface AiMarketingData {
  recommendations: MarketingRecommendation[]
  events: MarketingRecommendationEvent[]
  checks: Partial<Record<CheckType, IntegrationCheck>>
  actionLog: ActionLogEntry[]
  execSettings: ExecutionSetting[]
  liveEnvEnabled: boolean
  meta: LiveResult<PlatformPerformance>
  google: LiveResult<PlatformPerformance>
  attribution: AttributionReport | null
}

export function AiMarketingManager({
  initialSection,
  loadError,
  ...data
}: AiMarketingData & { initialSection: AiMarketingSection; loadError: string | null }) {
  const { lang } = useI18n()
  const s = getAiMarketingStrings(lang)
  const [section, setSection] = React.useState<AiMarketingSection>(initialSection)
  const pendingCount = data.recommendations.filter((r) => r.status === "pending").length

  const select = (next: AiMarketingSection) => {
    setSection(next)
    const url = new URL(window.location.href)
    url.searchParams.set("section", next)
    window.history.replaceState(null, "", url.toString())
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Megaphone className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-balance">{s.title}</h1>
            <p className="text-sm text-muted-foreground text-pretty">{s.subtitle}</p>
          </div>
        </div>
        <Badge className="self-start border-border text-muted-foreground">{s.phaseBadge}</Badge>
      </header>

      <Card className="flex items-start gap-3 border-primary/30 bg-primary/5 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">{s.safetyTitle}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{s.safetyBody}</p>
        </div>
      </Card>

      {loadError && (
        <Card role="alert" className="border-destructive/40 p-4 text-sm text-destructive">
          {s.loadError}
        </Card>
      )}

      <nav aria-label={s.title} className="-mx-1 overflow-x-auto">
        <div role="tablist" className="flex min-w-max gap-1 px-1">
          {AI_MARKETING_SECTIONS.map((key) => {
            const active = key === section
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`ai-mkt-${key}`}
                onClick={() => select(key)}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {s.sections[key]}
                {key === "approvals" && pendingCount > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs",
                      active ? "bg-primary-foreground/20" : "bg-primary/15 text-primary",
                    )}
                  >
                    {pendingCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </nav>

      <section id={`ai-mkt-${section}`} role="tabpanel" aria-label={s.sections[section]}>
        {section === "overview" && <OverviewSection s={s} data={data} onNavigate={select} />}
        {section === "meta" && <PlatformSection s={s} platform="meta" data={data} />}
        {section === "google" && <PlatformSection s={s} platform="google" data={data} />}
        {section === "recommendations" && <RecommendationsSection s={s} recommendations={data.recommendations} />}
        {section === "approvals" && <ApprovalQueueSection s={s} data={data} />}
        {section === "history" && <HistorySection s={s} data={data} />}
        {section === "settings" && <SettingsSection s={s} data={data} />}
      </section>
    </div>
  )
}
