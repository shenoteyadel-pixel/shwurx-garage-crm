"use client"

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { X } from "lucide-react"
import { Button, Input, Select, Textarea } from "@/components/ui"
import {
  assignConversation,
  setStatus,
  setFollowUp,
  addNote,
  searchCustomers,
  linkCustomer,
  createCustomerFromConversation,
  searchLinkables,
  linkRecord,
  listStaff,
  type ConversationDetail,
} from "@/lib/actions-whatsapp"
import { WA_SOURCES, WA_STATUSES } from "@/lib/whatsapp-status"

function toLocalInput(iso: string | null) {
  if (!iso) return ""
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b border-border p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

function LinkPicker({ id, kind, current, onChanged }: { id: string; kind: "appointment" | "job" | "quotation"; current: string | null; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const { data } = useSWR(open ? ["wa-link", id, kind] : null, () => searchLinkables(id, kind))
  const label = { appointment: "Appointment", job: "Job card", quotation: "Quotation" }[kind]
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {open ? (
        <Select
          aria-label={`Link ${label}`}
          className="h-8 max-w-48 text-xs"
          defaultValue=""
          onChange={async (e) => {
            await linkRecord(id, kind, e.target.value || null)
            setOpen(false)
            onChanged()
          }}
        >
          <option value="">{data ? (data.length ? "Choose…" : "None found") : "Loading…"}</option>
          {data?.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </Select>
      ) : (
        <button className="truncate text-right text-foreground underline-offset-2 hover:underline" onClick={() => setOpen(true)}>
          {current ?? "Link…"}
        </button>
      )}
    </div>
  )
}

export function LeadPanel({ detail, onClose, onChanged }: { detail: ConversationDetail; onClose: () => void; onChanged: () => void }) {
  const { conv, perms, customer, links, notes, events } = detail
  const { data: staff } = useSWR(perms.assign ? "wa-staff" : null, () => listStaff())
  const [note, setNote] = useState("")
  const [custQuery, setCustQuery] = useState("")
  const [newName, setNewName] = useState(conv.wa_name ?? "")
  const [err, setErr] = useState<string | null>(null)
  const { data: custResults } = useSWR(custQuery.length >= 2 ? ["wa-cust", custQuery] : null, () => searchCustomers(custQuery))

  const act = async (fn: () => Promise<unknown>) => {
    setErr(null)
    try {
      await fn()
      onChanged()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const referral = conv.referral as { headline?: string; source_url?: string } | null

  return (
    <aside className="flex h-full w-full max-w-sm flex-col overflow-y-auto border-l border-border bg-card" aria-label="Lead details">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h2 className="text-sm font-semibold text-foreground">Lead details</h2>
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close details">
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
      {err && <p role="alert" className="px-4 pt-3 text-xs text-destructive">{err}</p>}

      <Section title="Status">
        <Select
          aria-label="Lead status"
          value={conv.status}
          onChange={(e) => {
            const v = e.target.value
            const reason = v === "lost" ? window.prompt("Reason for losing this lead (optional)") ?? undefined : undefined
            act(() => setStatus(conv.id, v, reason))
          }}
        >
          {WA_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Select>
        {conv.status === "lost" && conv.lost_reason && <p className="text-xs text-muted-foreground">Reason: {conv.lost_reason}</p>}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Follow-up
          <Input
            type="datetime-local"
            defaultValue={toLocalInput(conv.follow_up_at)}
            onBlur={(e) => act(() => setFollowUp(conv.id, e.target.value ? new Date(e.target.value).toISOString() : null))}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Source: <span className="text-foreground">{WA_SOURCES[conv.lead_source] ?? conv.lead_source}</span>
          {referral?.headline && <> · {referral.headline}</>}
        </p>
      </Section>

      <Section title="Owner">
        {perms.assign ? (
          <Select aria-label="Assigned advisor" value={conv.assigned_to ?? ""} onChange={(e) => act(() => assignConversation(conv.id, e.target.value || null))}>
            <option value="">Unassigned</option>
            {staff?.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        ) : (
          <p className="text-sm text-foreground">{conv.assigned_name ?? "Unassigned"}</p>
        )}
      </Section>

      <Section title="Customer">
        {customer ? (
          <div className="flex items-center justify-between gap-2 text-sm">
            <Link href={`/customers/${customer.id}`} className="truncate font-medium text-foreground hover:underline">
              {customer.full_name}
            </Link>
            <Button size="sm" variant="ghost" onClick={() => act(() => linkCustomer(conv.id, null))}>Unlink</Button>
          </div>
        ) : (
          <>
            <Input placeholder="Search existing customer" aria-label="Search customers" value={custQuery} onChange={(e) => setCustQuery(e.target.value)} />
            {custResults?.map((c) => (
              <button
                key={c.id}
                className="rounded-md px-2 py-1 text-left text-sm text-foreground hover:bg-accent"
                onClick={() => act(() => linkCustomer(conv.id, c.id))}
              >
                {c.full_name} <span className="text-xs text-muted-foreground">{c.mobile}</span>
              </button>
            ))}
            <div className="flex gap-2">
              <Input placeholder="New customer name" aria-label="New customer name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Button size="sm" variant="outline" disabled={!newName.trim()} onClick={() => act(() => createCustomerFromConversation(conv.id, newName))}>
                Create
              </Button>
            </div>
          </>
        )}
      </Section>

      <Section title="Linked records">
        <LinkPicker id={conv.id} kind="appointment" current={links.appointment} onChanged={onChanged} />
        <LinkPicker id={conv.id} kind="quotation" current={links.quotation} onChanged={onChanged} />
        <LinkPicker id={conv.id} kind="job" current={links.job} onChanged={onChanged} />
        {conv.job_id && (
          <Link href={`/jobs/${conv.job_id}`} className="text-xs text-primary hover:underline">Open job card</Link>
        )}
      </Section>

      <Section title="Internal notes">
        <Textarea rows={2} placeholder="Only staff can see this" aria-label="New note" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button
          size="sm"
          variant="outline"
          className="self-end"
          disabled={!note.trim()}
          onClick={() => act(async () => { await addNote(conv.id, note); setNote("") })}
        >
          Add note
        </Button>
        {notes.map((n) => (
          <div key={n.id} className="rounded-md bg-secondary p-2 text-xs leading-relaxed text-secondary-foreground">
            <p className="whitespace-pre-wrap">{n.text}</p>
            <p className="mt-1 text-muted-foreground">{n.author_name} · {new Date(n.created_at).toLocaleString("en-GB")}</p>
          </div>
        ))}
      </Section>

      <Section title="Activity">
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {events.map((e) => (
            <li key={e.id}>
              <span className="text-foreground">{e.actor_name ?? "System"}</span> {e.action.replace(/_/g, " ")} · {new Date(e.created_at).toLocaleString("en-GB")}
            </li>
          ))}
        </ul>
      </Section>
    </aside>
  )
}
