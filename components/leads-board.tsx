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
} from "lucide-react"
import {
  setLeadStatus,
  assignLead,
  addLeadNote,
  convertLeadToCustomer,
  findCustomerForLead,
  LEAD_STATUSES,
  type LeadRow,
  type LeadStatus,
  type CustomerMatch,
} from "@/lib/actions-leads"

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
}: {
  leads: LeadRow[]
  staff: StaffOption[]
  canManage: boolean
}) {
  const [filter, setFilter] = useState<"all" | LeadStatus>("all")

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: leads.length }
    for (const s of LEAD_STATUSES) c[s] = 0
    for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1
    return c
  }, [leads])

  const visible = useMemo(
    () => (filter === "all" ? leads : leads.filter((l) => l.status === filter)),
    [leads, filter],
  )

  return (
    <div className="space-y-5">
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
            <LeadCard key={lead.id} lead={lead} staff={staff} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  )
}

function LeadCard({ lead, staff, canManage }: { lead: LeadRow; staff: StaffOption[]; canManage: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [convertOpen, setConvertOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState("")
  const [error, setError] = useState<string | null>(null)

  const meta = STATUS_META[lead.status]
  const md = lead.metadata ?? {}
  const notes = Array.isArray(md.notes) ? md.notes : []
  const utm = [md.utm_source, md.utm_medium, md.utm_campaign].filter(Boolean).join(" · ")
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
          {lead.service_interest ? (
            <div className="mt-2 inline-flex items-center gap-1.5 text-sm text-foreground">
              <Wrench className="h-3.5 w-3.5 text-primary" /> {lead.service_interest}
            </div>
          ) : null}
          {lead.message ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-sm text-muted-foreground">
              <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {lead.message}
            </p>
          ) : null}
          {utm || md.referrer || md.page_path ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              {utm ? (
                <span className="inline-flex items-center gap-1">
                  <Megaphone className="h-3 w-3" /> {utm}
                </span>
              ) : null}
              {md.referrer ? (
                <span className="inline-flex items-center gap-1">
                  <Globe className="h-3 w-3" /> {md.referrer}
                </span>
              ) : null}
              {md.page_path ? <span className="opacity-70">{md.page_path}</span> : null}
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

          <Select
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
          </Select>

          <Button size="sm" variant="outline" disabled={pending} onClick={() => setNoteOpen(true)}>
            <StickyNote className="h-3.5 w-3.5" /> Note
          </Button>

          {!isConverted ? (
            <Button size="sm" variant="success" disabled={pending} onClick={() => setConvertOpen(true)}>
              <UserPlus className="h-3.5 w-3.5" /> Convert to customer
            </Button>
          ) : null}
        </div>
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
