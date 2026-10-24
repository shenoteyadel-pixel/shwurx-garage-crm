"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, Badge, Button, Select, Textarea } from "@/components/ui"
import { Modal } from "@/components/modal"
import { formatDate } from "@/lib/utils"
import {
  Inbox,
  Phone,
  Mail,
  Wrench,
  MessageSquare,
  UserCheck,
  UserPlus,
  Globe,
  Megaphone,
  StickyNote,
  Send,
  Car,
  ExternalLink,
  Sparkles,
  Download,
  Trash2,
} from "lucide-react"
import { SOURCE_FILTERS, leadSourceKey, leadsToCsv, type LeadSourceKey } from "@/lib/lead-source"
import { leadOrigin, ORIGIN_FILTERS, type LeadOriginKind } from "@/lib/lead-origin"
import {
  setLeadStatus,
  assignLead,
  addLeadNote,
  deleteLead,
  convertLeadToCustomer,
  findCustomerForLead,
  type LeadRow,
  type CustomerMatch,
} from "@/lib/actions-leads"
import { LEAD_STATUSES, type LeadStatus } from "@/lib/lead-status"

const STATUS_META: Record<LeadStatus, { label: string; tone: string }> = {
  new: { label: "New", tone: "bg-amber-500/15 text-amber-400" },
  contacted: { label: "Contacted", tone: "bg-sky-500/15 text-sky-400" },
  qualified: { label: "Qualified", tone: "bg-violet-500/15 text-violet-300" },
  converted: { label: "Converted", tone: "bg-emerald-500/15 text-emerald-400" },
  lost: { label: "Lost", tone: "bg-muted text-muted-foreground" },
}

type StaffOption = { id: string; name: string }

const FILTERS: { key: "all" | LeadStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "converted", label: "Converted" },
  { key: "lost", label: "Lost" },
]

export function LeadsBoard({
  leads,
  staff,
  canManage,
  canDelete = false,
  assignmentUnavailable = false,
}: {
  leads: LeadRow[]
  staff: StaffOption[]
  canManage: boolean
  canDelete?: boolean
  assignmentUnavailable?: boolean
}) {
  const [filter, setFilter] = useState<"all" | LeadStatus>("all")
  const [origin, setOrigin] = useState<"all" | LeadOriginKind>("all")
  const [source, setSource] = useState<LeadSourceKey>("all")

  const sourceCounts = useMemo(() => {
    const c: Record<string, number> = { all: leads.length }
    for (const l of leads) {
      const k = leadSourceKey(l.source)
      c[k] = (c[k] ?? 0) + 1
    }
    return c
  }, [leads])

  const origins = useMemo(() => new Map(leads.map((l) => [l.id, leadOrigin(l.metadata, l.source)])), [leads])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: leads.length }
    for (const s of LEAD_STATUSES) c[s] = 0
    for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1
    return c
  }, [leads])

  const originCounts = useMemo(() => {
    const c: Record<string, number> = { all: leads.length }
    for (const o of origins.values()) {
      const key = o.kind === "appointment" ? "other" : o.kind
      c[key] = (c[key] ?? 0) + 1
    }
    return c
  }, [leads.length, origins])

  const visible = useMemo(
    () =>
      leads.filter((l) => {
        if (filter !== "all" && l.status !== filter) return false
        if (source !== "all" && leadSourceKey(l.source) !== source) return false
        if (origin === "all") return true
        const kind = origins.get(l.id)?.kind
        return origin === "other" ? kind === "other" || kind === "appointment" : kind === origin
      }),
    [leads, filter, origin, origins, source],
  )

  function downloadCsv() {
    const blob = new Blob([leadsToCsv(visible)], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `leads-${source === "all" ? "all" : source}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="lead-source-filter" className="text-xs font-medium text-muted-foreground">
          Source
        </label>
        <select
          id="lead-source-filter"
          value={source}
          onChange={(e) => setSource(e.target.value as LeadSourceKey)}
          className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {SOURCE_FILTERS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label} ({sourceCounts[s.key] ?? 0})
            </option>
          ))}
        </select>
        <label htmlFor="lead-origin-filter" className="text-xs font-medium text-muted-foreground">
          Origin
        </label>
        <select
          id="lead-origin-filter"
          value={origin}
          onChange={(e) => setOrigin(e.target.value as "all" | LeadOriginKind)}
          className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {ORIGIN_FILTERS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label} ({originCounts[o.key] ?? 0})
            </option>
          ))}
        </select>
        {canManage ? (
          <button
            type="button"
            onClick={downloadCsv}
            disabled={visible.length === 0}
            className="ms-auto inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Download CSV ({visible.length})
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                (active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground")
              }
            >
              {f.label}
              <span className={active ? "opacity-80" : "opacity-60"}>{counts[f.key] ?? 0}</span>
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <Card className="py-12 text-center text-sm text-muted-foreground">
          No leads in this view.
        </Card>
      ) : (
        <div className="grid gap-3">
          {visible.map((lead) => (
            <LeadCard key={lead.id} lead={lead} staff={staff} canManage={canManage} canDelete={canDelete} assignmentUnavailable={assignmentUnavailable} />
          ))}
        </div>
      )}
    </div>
  )
}

function LeadCard({
  lead,
  staff,
  canManage,
  canDelete,
  assignmentUnavailable,
}: {
  lead: LeadRow
  staff: StaffOption[]
  canManage: boolean
  canDelete: boolean
  assignmentUnavailable: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [convertOpen, setConvertOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState("")
  const [error, setError] = useState<string | null>(null)

  const meta = STATUS_META[lead.status]
  const md = lead.metadata ?? {}
  const notes = Array.isArray(md.notes) ? md.notes : []
  const origin = leadOrigin(md, lead.source)
  const utm = origin.campaign
  const vehicle = [origin.model, origin.year].filter(Boolean).join(" · ")
  const isConverted = lead.status === "converted"

  function run(fn: () => Promise<unknown>) {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
        router.refresh()
      } catch (e) {
        setError((e as Error)?.message ?? "Something went wrong")
      }
    })
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-foreground">{lead.name || "Unnamed lead"}</span>
            <Badge className={meta.tone}>{meta.label}</Badge>
            {lead.source ? <Badge className="bg-muted text-muted-foreground">{lead.source}</Badge> : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {lead.phone ? (
              <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                <Phone className="h-3 w-3" /> {lead.phone}
              </a>
            ) : null}
            {lead.email ? (
              <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                <Mail className="h-3 w-3" /> {lead.email}
              </a>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {origin.path ? (
              <a
                href={origin.path}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-medium text-primary hover:bg-primary/15"
              >
                {origin.kind === "advisor" ? <Sparkles className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                {origin.label}
                <ExternalLink className="h-3 w-3 opacity-70" />
                <span className="sr-only">(opens the website page)</span>
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-medium text-primary">
                {origin.kind === "advisor" ? <Sparkles className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                {origin.label}
              </span>
            )}
            {vehicle ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-foreground">
                <Car className="h-3 w-3 text-primary" /> {vehicle}
              </span>
            ) : null}
          </div>
          {lead.service_interest ? (
            <div className="mt-2 inline-flex items-center gap-1.5 text-sm text-foreground">
              <Wrench className="h-3.5 w-3.5 text-primary" /> {lead.service_interest}
            </div>
          ) : null}
          {lead.message ? (
            <p className="mt-1.5 flex items-start gap-1.5 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              <MessageSquare className="mt-1 h-3.5 w-3.5 shrink-0" /> {lead.message}
            </p>
          ) : null}
          {utm || origin.referrer ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              {utm ? (
                <span className="inline-flex items-center gap-1">
                  <Megaphone className="h-3 w-3" /> {utm}
                </span>
              ) : null}
              {origin.referrer ? (
                <span className="inline-flex items-center gap-1">
                  <Globe className="h-3 w-3" /> {origin.referrer}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="text-right text-xs text-muted-foreground">
          <div>Received {formatDate(lead.created_at)}</div>
          {md.assigned_name ? (
            <div className="mt-1 inline-flex items-center gap-1 text-foreground">
              <UserCheck className="h-3 w-3 text-primary" /> {md.assigned_name}
            </div>
          ) : null}
          {lead.customer_id ? (
            <a
              href={`/customers/${lead.customer_id}`}
              className="mt-1 block text-primary hover:underline"
            >
              View customer
            </a>
          ) : null}
        </div>
      </div>

      {notes.length > 0 ? (
        <div className="mt-3 space-y-1.5 border-t border-border pt-3">
          {notes.map((n, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <StickyNote className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
              <span>
                <span className="text-foreground">{n.text}</span>
                <span className="ml-1.5 opacity-60">
                  — {n.by}, {formatDate(n.at)}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}

      {canManage ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Select
            aria-label="Lead status"
            className="h-8 w-auto text-xs"
            value={lead.status}
            disabled={pending || isConverted}
            onChange={(e) => run(() => setLeadStatus(lead.id, e.target.value as LeadStatus))}
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>

          {assignmentUnavailable ? <span className="text-xs text-muted-foreground">Assignment unavailable</span> : <Select
            aria-label="Assign to"
            className="h-8 w-auto text-xs"
            value={md.assigned_to ?? ""}
            disabled={pending}
            onChange={(e) => run(() => assignLead(lead.id, e.target.value || null))}
          >
            <option value="">Unassigned</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>}

          {lead.phone ? (
            <>
              <a
                href={`tel:${lead.phone}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-muted"
              >
                <Phone className="h-3.5 w-3.5" /> Call
              </a>
              <a
                href={`https://wa.me/${lead.phone.replace(/[^\d]/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-muted"
              >
                <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
              </a>
            </>
          ) : null}

          <Button size="sm" variant="outline" disabled={pending} onClick={() => setNoteOpen(true)}>
            <StickyNote className="h-3.5 w-3.5" /> Note
          </Button>

          <p className="w-full text-xs text-muted-foreground">
            Opening Call or WhatsApp does not confirm contact. Record the actual call or conversation outcome in a note before updating the lead status.
          </p>

          {!isConverted ? (
            <Button size="sm" variant="success" disabled={pending} onClick={() => setConvertOpen(true)}>
              <UserPlus className="h-3.5 w-3.5" /> Convert to customer
            </Button>
          ) : null}

          {canDelete ? (
            <Button
              size="sm"
              variant="danger"
              className="ml-auto"
              disabled={pending}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          ) : null}
        </div>
      ) : null}

      {canDelete ? (
        <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} size="sm" title="Delete lead?">
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {lead.name || "This lead"} will be removed from the Leads list. Meta and Google Ads won&apos;t
              re-import it.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={pending} onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    await deleteLead(lead.id)
                    setDeleteOpen(false)
                  })
                }
              >
                <Trash2 className="h-3.5 w-3.5" /> {pending ? "Deleting…" : "Delete lead"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      <NoteModal
        open={noteOpen}
        onClose={() => {
          setNoteOpen(false)
          setNoteText("")
        }}
        pending={pending}
        value={noteText}
        onChange={setNoteText}
        onSubmit={() =>
          run(async () => {
            await addLeadNote(lead.id, noteText)
            setNoteOpen(false)
            setNoteText("")
          })
        }
      />

      <ConvertModal
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        lead={lead}
        onDone={(customerId) => {
          setConvertOpen(false)
          router.push(`/customers/${customerId}`)
        }}
      />
    </Card>
  )
}

function NoteModal({
  open,
  onClose,
  pending,
  value,
  onChange,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  pending: boolean
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Add follow-up note">
      <div className="space-y-4">
        <Textarea
          rows={4}
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Called customer, will come in Saturday for a quote."
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={pending || !value.trim()} onClick={onSubmit}>
            <Send className="h-3.5 w-3.5" /> {pending ? "Saving…" : "Add note"}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ConvertModal({
  open,
  onClose,
  lead,
  onDone,
}: {
  open: boolean
  onClose: () => void
  lead: LeadRow
  onDone: (customerId: string) => void
}) {
  const [pending, startTransition] = useTransition()
  const [match, setMatch] = useState<CustomerMatch | null>(null)
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function ensureChecked() {
    if (checked) return
    startTransition(async () => {
      try {
        const found = await findCustomerForLead(lead.id)
        setMatch(found)
      } catch {
        /* non-fatal — fall back to creating a new customer */
      } finally {
        setChecked(true)
      }
    })
  }

  function convert(useExistingCustomerId: string | null) {
    setError(null)
    startTransition(async () => {
      try {
        const res = await convertLeadToCustomer(lead.id, { useExistingCustomerId })
        onDone(res.customerId)
      } catch (e) {
        setError((e as Error)?.message ?? "Could not convert this lead")
      }
    })
  }

  return (
    <Modal open={open} onClose={onClose} size="sm" title="Convert to customer">
      <div className="space-y-4" onFocus={ensureChecked}>
        {!checked ? (
          <button type="button" onClick={ensureChecked} className="text-sm text-primary hover:underline">
            Check for an existing customer…
          </button>
        ) : match ? (
          <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm">
            <p className="font-medium text-foreground">Existing customer found</p>
            <p className="mt-0.5 text-muted-foreground">
              {match.full_name}
              {match.mobile ? ` · ${match.mobile}` : ""}
              {match.email ? ` · ${match.email}` : ""}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Matched on {match.matchedOn}. Link this lead to the existing customer to avoid a duplicate record.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No matching customer found. A new customer will be created from the lead details.
          </p>
        )}

        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="font-medium text-foreground">{lead.name || "Website lead"}</p>
          <p className="text-muted-foreground">
            {[lead.phone, lead.email].filter(Boolean).join(" · ") || "No contact details"}
          </p>
          {lead.service_interest ? <p className="mt-1 text-muted-foreground">{lead.service_interest}</p> : null}
        </div>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <div className="flex flex-col gap-2">
          {match ? (
            <Button disabled={pending} onClick={() => convert(match.id)}>
              {pending ? "Linking…" : `Use ${match.full_name}`}
            </Button>
          ) : null}
          <Button variant={match ? "outline" : "primary"} disabled={pending} onClick={() => convert(null)}>
            {pending ? "Creating…" : match ? "Create new customer instead" : "Create customer"}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
