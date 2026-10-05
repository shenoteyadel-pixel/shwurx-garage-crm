"use client"

import { useMemo, useState, useTransition } from "react"
import {
  AlertTriangle,
  BarChart3,
  ExternalLink,
  Eye,
  FileText,
  ImageIcon,
  ListTree,
  Loader2,
  Pencil,
  Search,
  SearchCheck,
  UserPlus,
  FilePlus2,
  ClipboardList,
} from "lucide-react"
import { Badge, Button, Card } from "@/components/ui"
import { setWebsitePreview } from "@/lib/actions-website-cms"
import type { WebsiteOverviewDTO } from "@/lib/website/control-center-data"
import type { InventoryEditTarget, InventoryItem, InventoryStatus, InventoryType } from "@/lib/website/inventory"

const TYPE_LABEL: Record<InventoryType, string> = {
  core: "Page",
  brand: "Brand",
  service: "Service",
  team: "Team",
  custom: "Custom page",
  blog: "Blog",
  form: "Form",
}

const STATUS_STYLE: Record<InventoryStatus, string> = {
  published: "bg-primary/15 text-primary",
  draft: "bg-amber-500/15 text-amber-600",
  hidden: "bg-muted text-muted-foreground",
}

const STATUS_LABEL: Record<InventoryStatus, string> = { published: "Published", draft: "Draft", hidden: "Hidden" }

type Filter = "all" | InventoryType | "issues" | "unpublished"

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "core", label: "Pages" },
  { key: "brand", label: "Brands" },
  { key: "service", label: "Services" },
  { key: "team", label: "Team" },
  { key: "custom", label: "Custom" },
  { key: "blog", label: "Blog" },
  { key: "issues", label: "Needs attention" },
  { key: "unpublished", label: "Unpublished changes" },
]

export type OverviewAction =
  | { kind: "edit"; target: InventoryEditTarget }
  | { kind: "add-member" }
  | { kind: "add-page" }
  | { kind: "analytics" }

export function WebsiteOverview({
  overview,
  draftVersion,
  hasUnpublished,
  canAnalytics,
  onAction,
}: {
  overview: WebsiteOverviewDTO
  draftVersion: number
  hasUnpublished: boolean
  canAnalytics: boolean
  onAction: (a: OverviewAction) => void
}) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const items = overview.inventory
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((i) => {
      if (filter === "issues" && i.flags.length === 0 && i.complete.en && i.complete.ar) return false
      if (filter === "unpublished" && !i.changed && i.status !== "draft") return false
      if (filter !== "all" && filter !== "issues" && filter !== "unpublished" && i.type !== filter) return false
      if (!q) return true
      return [i.title.en, i.title.ar, i.path, TYPE_LABEL[i.type]].some((s) => s.toLowerCase().includes(q))
    })
  }, [items, query, filter])

  const counts = useMemo(
    () => ({
      published: items.filter((i) => i.status === "published").length,
      draft: items.filter((i) => i.status === "draft").length,
      hidden: items.filter((i) => i.status === "hidden").length,
      attention: items.filter((i) => i.flags.length > 0).length,
    }),
    [items],
  )

  const preview = (path: string) =>
    start(async () => {
      setError(null)
      const r = await setWebsitePreview("draft")
      if (!r.ok) return setError(r.error)
      window.open(path, "_blank", "noopener")
    })

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Live website</p>
            {overview.liveUrl ? (
              <a
                href={overview.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 truncate text-lg font-semibold hover:text-primary"
              >
                {overview.liveUrl.replace(/^https?:\/\//, "")}
                <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : (
              <p className="text-lg font-semibold">No public domain configured</p>
            )}
            <p className="text-sm text-muted-foreground">
              {overview.lastPublishedAt
                ? `Last published ${formatWhen(overview.lastPublishedAt)}${overview.lastPublishedBy ? ` by ${overview.lastPublishedBy}` : ""}`
                : "Not published yet — the live site still uses the original content."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Draft v{draftVersion}</Badge>
            {hasUnpublished ? (
              <Badge className="bg-amber-500/15 text-amber-600">Draft has unpublished changes</Badge>
            ) : (
              <Badge className="bg-primary/15 text-primary">Live matches draft</Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {overview.liveUrl && (
            <Button size="sm" variant="outline" onClick={() => window.open(overview.liveUrl!, "_blank", "noopener")}>
              <ExternalLink className="h-4 w-4" /> Open live site
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={pending} onClick={() => preview("/")}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Preview saved draft
          </Button>
          <Button size="sm" onClick={() => onAction({ kind: "add-member" })}>
            <UserPlus className="h-4 w-4" /> Add team member
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAction({ kind: "add-page" })}>
            <FilePlus2 className="h-4 w-4" /> Add page
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm sm:grid-cols-4">
          <Stat label="Published" value={counts.published} />
          <Stat label="Draft" value={counts.draft} />
          <Stat label="Hidden" value={counts.hidden} />
          <Stat label="Need attention" value={counts.attention} />
        </dl>
      </Card>

      <nav aria-label="Website tools" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Shortcut icon={ImageIcon} label="Media" onClick={() => onAction({ kind: "edit", target: { kind: "builder", section: "media" } })} />
        <Shortcut icon={SearchCheck} label="SEO & redirects" onClick={() => onAction({ kind: "edit", target: { kind: "builder", section: "seo" } })} />
        <Shortcut icon={ListTree} label="Navigation" onClick={() => onAction({ kind: "edit", target: { kind: "builder", section: "nav" } })} />
        <Shortcut icon={ClipboardList} label="Forms" onClick={() => onAction({ kind: "edit", target: { kind: "builder", section: "form" } })} />
        <Shortcut icon={FileText} label="Blog" onClick={() => onAction({ kind: "edit", target: { kind: "blog" } })} />
        {canAnalytics && <Shortcut icon={BarChart3} label="Tracking" onClick={() => onAction({ kind: "analytics" })} />}
      </nav>

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-base font-semibold">All website pages</h2>
          <label className="relative md:w-72">
            <span className="sr-only">Search pages</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title or route"
              className="h-9 w-full rounded-lg border border-input bg-background/60 pl-9 pr-3 text-sm"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter pages">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={
                "rounded-full px-3 py-1 text-xs font-medium transition " +
                (filter === f.key ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground")
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground" aria-live="polite">
          Showing {visible.length} of {items.length}
        </p>

        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {visible.map((item) => (
            <InventoryRow
              key={item.key}
              item={item}
              disabled={pending}
              onEdit={() => onAction({ kind: "edit", target: item.edit })}
              onPreview={() => preview(item.path)}
            />
          ))}
          {visible.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">No pages match.</li>}
        </ul>
      </Card>
    </div>
  )
}

function InventoryRow({
  item,
  disabled,
  onEdit,
  onPreview,
}: {
  item: InventoryItem
  disabled: boolean
  onEdit: () => void
  onPreview: () => void
}) {
  const title = item.title.en || item.title.ar || "Untitled"
  return (
    <li className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold">{title}</span>
          {item.title.ar && item.title.en && (
            <span dir="rtl" lang="ar" className="truncate text-sm text-muted-foreground">
              {item.title.ar}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-mono text-muted-foreground">{item.path}</span>
          <span className="text-muted-foreground" aria-hidden>
            ·
          </span>
          <span className="text-muted-foreground">{TYPE_LABEL[item.type]}</span>
          <Badge className={STATUS_STYLE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
          {item.changed && item.status !== "draft" && (
            <Badge className="bg-amber-500/15 text-amber-600">Edited</Badge>
          )}
          <LangPill label="EN" ok={item.complete.en} />
          <LangPill label="AR" ok={item.complete.ar} />
        </div>
        {item.flags.length > 0 && (
          <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-amber-600">
            {item.flags.map((f) => (
              <li key={f} className="inline-flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" aria-hidden /> {f}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="outline" onClick={onEdit} aria-label={`Edit ${title}`}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
        <Button size="sm" variant="ghost" disabled={disabled} onClick={onPreview} aria-label={`Preview ${title}`}>
          <Eye className="h-3.5 w-3.5" /> Preview
        </Button>
      </div>
    </li>
  )
}

function LangPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={
        "rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold " +
        (ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")
      }
      title={ok ? `${label} complete` : `${label} incomplete`}
    >
      {label}
      <span className="sr-only">{ok ? " complete" : " incomplete"}</span>
    </span>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function Shortcut({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-medium transition hover:border-primary/50 hover:text-primary"
    >
      <Icon className="h-4 w-4 text-primary" />
      {label}
    </button>
  )
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}
