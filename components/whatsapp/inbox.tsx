"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import useSWR from "swr"
import { Search, MessageCircle, AlarmClock, ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input, Select } from "@/components/ui"
import { listConversations, type InboxFilters } from "@/lib/actions-whatsapp"
import { WA_SOURCES, WA_STATUSES, statusLabel } from "@/lib/whatsapp-status"
import { Thread } from "@/components/whatsapp/thread"

function timeAgo(iso: string | null) {
  if (!iso) return ""
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return "now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
}

export function WhatsAppInbox({ sendingLive }: { sendingLive: boolean }) {
  const router = useRouter()
  const params = useSearchParams()
  const selected = params.get("c")
  const [filters, setFilters] = useState<InboxFilters>({ view: "all" })

  const { data, error, mutate } = useSWR(["wa-list", filters], () => listConversations(filters), {
    refreshInterval: 10_000,
    keepPreviousData: true,
  })

  const select = (id: string | null) => router.replace(id ? `/whatsapp?c=${id}` : "/whatsapp", { scroll: false })
  const now = Date.now()

  return (
    <div className="flex flex-col gap-3">
      {!sendingLive && (
        <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
          Test mode: replies are saved in the CRM but are not delivered to customers until sending is switched on.
        </p>
      )}

      <div className="flex h-[calc(100dvh-13rem)] min-h-[520px] overflow-hidden rounded-xl border border-border bg-card">
        <aside
          className={cn(
            "flex w-full flex-col border-r border-border md:w-80 md:shrink-0",
            selected ? "hidden md:flex" : "flex",
          )}
          aria-label="Conversations"
        >
          <div className="flex flex-col gap-2 border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                placeholder="Search name, number, message"
                className="pl-9"
                aria-label="Search conversations"
                value={filters.q ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              />
            </div>
            <div className="flex gap-1 rounded-lg bg-secondary p-1 text-xs" role="tablist" aria-label="Ownership">
              {(["all", "mine", "unassigned"] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={filters.view === v}
                  onClick={() => setFilters((f) => ({ ...f, view: v }))}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1 font-medium capitalize transition",
                    filters.view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v === "all" ? (data?.canAll ? "All" : "Visible") : v}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Select
                aria-label="Status"
                className="h-8 text-xs"
                value={filters.status ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined }))}
              >
                <option value="">All statuses</option>
                {WA_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
              <Select
                aria-label="Source"
                className="h-8 text-xs"
                value={filters.source ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value || undefined }))}
              >
                <option value="">All sources</option>
                {Object.entries(WA_SOURCES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={!!filters.overdue}
                onChange={(e) => setFilters((f) => ({ ...f, overdue: e.target.checked || undefined }))}
              />
              Overdue follow-ups only
            </label>
          </div>

          <ul className="flex-1 overflow-y-auto">
            {error && <li className="p-4 text-sm text-destructive">{(error as Error).message}</li>}
            {!data && !error && <li className="p-4 text-sm text-muted-foreground">Loading…</li>}
            {data?.rows.length === 0 && (
              <li className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
                <MessageCircle className="h-8 w-8" aria-hidden />
                No WhatsApp conversations yet. Incoming messages will appear here.
              </li>
            )}
            {data?.rows.map((c) => {
              const overdue = c.follow_up_at && new Date(c.follow_up_at).getTime() < now && c.status !== "won" && c.status !== "lost"
              return (
                <li key={c.id}>
                  <button
                    onClick={() => select(c.id)}
                    aria-current={selected === c.id}
                    className={cn(
                      "flex w-full flex-col gap-1 border-b border-border px-3 py-3 text-left transition hover:bg-accent",
                      selected === c.id && "bg-accent",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm", c.unread_count ? "font-semibold text-foreground" : "font-medium text-foreground")}>
                        {c.customer_name || c.wa_name || `+${c.wa_phone}`}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(c.last_message_at)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">{c.last_message_preview}</span>
                      {c.unread_count > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                          <span className="sr-only">Unread messages: </span>
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">{statusLabel(c.status)}</span>
                      {c.lead_source !== "direct" && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{WA_SOURCES[c.lead_source]}</span>
                      )}
                      <span className="text-muted-foreground">{c.assigned_name ?? "Unassigned"}</span>
                      {overdue && (
                        <span className="flex items-center gap-0.5 text-destructive">
                          <AlarmClock className="h-3 w-3" aria-hidden /> Overdue
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>

        <section className={cn("min-w-0 flex-1", selected ? "flex" : "hidden md:flex")} aria-label="Conversation">
          {selected ? (
            <div className="flex min-w-0 flex-1 flex-col">
              <button
                onClick={() => select(null)}
                className="flex items-center gap-1 border-b border-border px-3 py-2 text-xs text-muted-foreground md:hidden"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden /> All conversations
              </button>
              <Thread key={selected} id={selected} onChanged={() => mutate()} />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
              Select a conversation to view messages
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
