"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check, ExternalLink, FileText, Paperclip, ShieldCheck, X } from "lucide-react"
import { Badge, Button, Card, Field, Input, Select, Textarea } from "@/components/ui"
import { SubscriptionForm, type StaffOption, type SubscriptionFormValues } from "@/components/subscription-form"
import { CATEGORY_LABEL, CRIT_TONE, CYCLE_LABEL, DUE_LABEL, DUE_TONE, money } from "@/components/subscription-labels"
import {
  decideSubscriptionPayment,
  getSubscriptionFileUrl,
  openBillingPortal,
  reactivateSubscription,
  recordSubscriptionPayment,
  resolveSubscriptionDue,
  uploadSubscriptionAttachment,
  verifyBillingPortal,
} from "@/lib/actions-subscriptions"
import {
  PAYMENT_METHODS,
  daysBetween,
  dubaiToday,
  dueState,
  grossCycleAED,
  portalMatchesVendor,
  type SubscriptionLike,
  type SubscriptionCategory,
} from "@/lib/subscriptions"

export interface DetailData {
  sub: SubscriptionLike & {
    id: string
    service_name: string
    category: SubscriptionCategory
    vendor: string
    resolved_reason: string
    renewal_type: string
    owner: string
    billing_portal_url: string
    portal_verified_at: string | null
    verification_source: string
  }
  form: SubscriptionFormValues
  payments: {
    id: string
    due_date: string
    amount: number
    currency: string
    paid_on: string
    method: string
    transaction_ref: string
    hasReceipt: boolean
    hasInvoice: boolean
    status: "pending_confirmation" | "confirmed" | "rejected"
    confirmation_source: string
    note: string
    recorded_by: string
    recorded_by_name: string
    recorded_at: string
    decided_by_name: string
    decided_at: string | null
    decision_note: string
  }[]
  attachments: { id: string; kind: string; file_name: string; uploaded_by_name: string; created_at: string }[]
  reminders: {
    id: string
    due_date: string
    stage: string
    channel: string
    status: string
    attempts: number
    last_error: string
    created_at: string
    escalated: boolean
  }[]
}

const METHOD_LABEL: Record<string, string> = {
  provider_portal: "Provider billing portal",
  bank_transfer: "Bank transfer",
  hosted_checkout: "Hosted checkout",
  cash: "Cash",
  other: "Other",
}

const PAY_TONE: Record<string, string> = {
  pending_confirmation: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  confirmed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  rejected: "border-red-500/40 bg-red-500/10 text-red-300",
}

const fmtDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" })

export function SubscriptionDetail({
  data,
  staff,
  canManage,
  canApprove,
  currentUserId,
  isOwner,
}: {
  data: DetailData
  staff: StaffOption[]
  canManage: boolean
  canApprove: boolean
  currentUserId: string
  isOwner: boolean
}) {
  const router = useRouter()
  const { sub } = data
  const today = dubaiToday()
  const state = dueState(sub, today)
  const daysLeft = daysBetween(today, sub.next_due_date)
  const [editing, setEditing] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const pending = data.payments.find((p) => p.status === "pending_confirmation")
  const portalMatch = portalMatchesVendor(sub.vendor, sub.billing_portal_url)

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null)
    setBusy(true)
    const res = await fn()
    setBusy(false)
    if (!res.ok) setErr(res.error ?? "Something went wrong.")
    else router.refresh()
    return res.ok
  }

  async function openPortal() {
    setErr(null)
    const res = await openBillingPortal(sub.id)
    if (!res.ok) return setErr(res.error)
    window.open(res.url, "_blank", "noopener,noreferrer")
  }

  const dueText =
    state === "resolved"
      ? `Cycle resolved: ${sub.resolved_reason || "no payment needed"}`
      : state === "inactive"
        ? `Status: ${sub.status.replace("_", " ")}`
        : daysLeft < 0
          ? `${Math.abs(daysLeft)} day${daysLeft === -1 ? "" : "s"} overdue`
          : daysLeft === 0
            ? "Due today"
            : `Due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`

  return (
    <div className="flex flex-col gap-6">
      <Link href="/finance/subscriptions" className="inline-flex items-center gap-1.5 self-start text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Subscriptions & Renewals
      </Link>

      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-balance text-2xl font-semibold text-foreground">{sub.service_name}</h1>
            <Badge className={CRIT_TONE[sub.criticality]}>{sub.criticality}</Badge>
            <Badge className={DUE_TONE[state]}>{DUE_LABEL[state]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {CATEGORY_LABEL[sub.category]}
            {sub.vendor ? ` · ${sub.vendor}` : ""} · {CYCLE_LABEL[sub.billing_cycle]} · {sub.renewal_type === "auto" ? "Auto-renews" : "Manual renewal"}
            {sub.owner ? ` · Owner: ${sub.owner}` : " · No owner assigned"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {sub.billing_portal_url ? (
            <Button variant="secondary" size="sm" onClick={openPortal} disabled={!sub.portal_verified_at}>
              <ExternalLink className="h-4 w-4" aria-hidden />
              Open billing portal
            </Button>
          ) : null}
          {canManage ? (
            <Button variant="ghost" size="sm" onClick={() => setEditing((e) => !e)}>
              {editing ? "Close editor" : "Edit details"}
            </Button>
          ) : null}
        </div>
      </header>

      {err ? (
        <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {err}
        </p>
      ) : null}

      <section aria-label="Renewal summary" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="flex flex-col gap-1 p-4">
          <span className="text-xs text-muted-foreground">Next due</span>
          <span className="text-lg font-semibold text-foreground">{fmtDate(sub.next_due_date)}</span>
          <span className="text-xs text-muted-foreground">{dueText}</span>
        </Card>
        <Card className="flex flex-col gap-1 p-4">
          <span className="text-xs text-muted-foreground">Per cycle</span>
          <span className="text-lg font-semibold text-foreground">{money(sub.amount, sub.currency)}</span>
          <span className="text-xs text-muted-foreground">
            {money(grossCycleAED(sub))} incl. VAT{sub.currency !== "AED" ? ` at ${sub.fx_rate_to_aed} AED/${sub.currency}` : ""}
          </span>
        </Card>
        <Card className="flex flex-col gap-1 p-4">
          <span className="text-xs text-muted-foreground">Billing portal</span>
          {!sub.billing_portal_url ? (
            <span className="text-sm text-muted-foreground">Not set. Add the official portal link in the details.</span>
          ) : sub.portal_verified_at ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-300">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Verified {fmtDate(sub.portal_verified_at)}
            </span>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-sm text-amber-300">
                Not verified. {portalMatch === false ? "This link does not match the vendor's known billing domain." : "An approver must confirm this is the provider's official site."}
              </span>
              {canApprove ? (
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => verifyBillingPortal(sub.id))}>
                  Mark link as verified
                </Button>
              ) : null}
            </div>
          )}
        </Card>
      </section>

      {editing && canManage ? (
        <Card className="p-4 md:p-6">
          <SubscriptionForm
            initial={data.form}
            staff={staff}
            canApprove={canApprove}
            onDone={() => {
              setEditing(false)
              router.refresh()
            }}
          />
        </Card>
      ) : null}

      {canManage && (state === "overdue" || state === "due_today" || state === "due_soon") && !pending ? (
        <RecordPayment subscriptionId={sub.id} currency={sub.currency} amount={sub.amount} dueDate={sub.next_due_date} onDone={() => router.refresh()} />
      ) : null}

      {canManage ? <ResolveDue status={sub.status} busy={busy} run={run} id={sub.id} /> : null}

      <section aria-labelledby="payments-h" className="flex flex-col gap-3">
        <h2 id="payments-h" className="text-sm font-semibold text-foreground">
          Payment history
        </h2>
        {data.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.payments.map((p) => (
              <PaymentItem
                key={p.id}
                p={p}
                canDecide={canApprove && p.status === "pending_confirmation"}
                selfRecorded={p.recorded_by === currentUserId && !isOwner}
                busy={busy}
                run={run}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="files-h" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 id="files-h" className="text-sm font-semibold text-foreground">
            Invoices & documents
          </h2>
        </div>
        {canManage ? <UploadAttachment subscriptionId={sub.id} onDone={() => router.refresh()} /> : null}
        {data.attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {data.attachments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate text-sm text-foreground">{a.file_name}</span>
                  <span className="text-xs capitalize text-muted-foreground">{a.kind}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {a.uploaded_by_name} · {fmtDate(a.created_at)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const res = await getSubscriptionFileUrl(a.id)
                      if (!res.ok) return setErr(res.error)
                      window.open(res.url, "_blank", "noopener,noreferrer")
                    }}
                  >
                    Open
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canManage || canApprove ? (
        <section aria-labelledby="rem-h" className="flex flex-col gap-3">
          <h2 id="rem-h" className="text-sm font-semibold text-foreground">
            Reminder log
          </h2>
          {data.reminders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reminders sent for this subscription yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 font-medium">When</th>
                    <th className="px-4 py-2 font-medium">Stage</th>
                    <th className="px-4 py-2 font-medium">Channel</th>
                    <th className="px-4 py-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {data.reminders.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 text-muted-foreground">{fmtDateTime(r.created_at)}</td>
                      <td className="px-4 py-2 text-foreground">
                        {r.stage.replace(/_/g, " ")}
                        {r.escalated ? <span className="ml-2 text-xs text-red-300">escalated</span> : null}
                      </td>
                      <td className="px-4 py-2 capitalize text-foreground">{r.channel.replace("_", "-")}</td>
                      <td className="px-4 py-2">
                        <span className={r.status === "sent" ? "text-emerald-300" : r.status === "failed" ? "text-red-300" : "text-muted-foreground"}>
                          {r.status}
                          {r.attempts > 1 ? ` (${r.attempts} tries)` : ""}
                        </span>
                        {r.last_error ? <p className="text-xs text-muted-foreground">{r.last_error}</p> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
}

function PaymentItem({
  p,
  canDecide,
  selfRecorded,
  busy,
  run,
}: {
  p: DetailData["payments"][number]
  canDecide: boolean
  selfRecorded: boolean
  busy: boolean
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>
}) {
  const [note, setNote] = React.useState("")
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{money(p.amount, p.currency)}</span>
          <Badge className={PAY_TONE[p.status]}>{p.status === "pending_confirmation" ? "Awaiting confirmation" : p.status}</Badge>
          {p.hasReceipt ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Paperclip className="h-3 w-3" aria-hidden />
              receipt
            </span>
          ) : null}
        </div>
        <span className="text-xs text-muted-foreground">
          Paid {fmtDate(p.paid_on)} for the {fmtDate(p.due_date)} cycle
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        {METHOD_LABEL[p.method] ?? p.method}
        {p.transaction_ref ? ` · Ref ${p.transaction_ref}` : ""} · Recorded by {p.recorded_by_name || "unknown"}
        {p.note ? ` · ${p.note}` : ""}
      </p>
      {p.decided_at ? (
        <p className="text-xs text-muted-foreground">
          {p.status === "confirmed" ? "Confirmed" : "Rejected"} by {p.decided_by_name} on {fmtDateTime(p.decided_at)}
          {p.decision_note ? ` · ${p.decision_note}` : ""}
        </p>
      ) : null}
      {canDecide ? (
        selfRecorded ? (
          <p className="text-xs text-amber-300">You recorded this payment, so another approver must confirm it.</p>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Decision note" htmlFor={`note-${p.id}`} className="flex-1">
              <Input id={`note-${p.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Required when rejecting" />
            </Field>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy} onClick={() => run(() => decideSubscriptionPayment(p.id, "confirmed", note))}>
                <Check className="h-4 w-4" aria-hidden />
                Confirm paid
              </Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => decideSubscriptionPayment(p.id, "rejected", note))}>
                <X className="h-4 w-4" aria-hidden />
                Reject
              </Button>
            </div>
          </div>
        )
      ) : null}
    </li>
  )
}

function RecordPayment({
  subscriptionId,
  currency,
  amount,
  dueDate,
  onDone,
}: {
  subscriptionId: string
  currency: string
  amount: number
  dueDate: string
  onDone: () => void
}) {
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const formRef = React.useRef<HTMLFormElement>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    const fd = new FormData(e.currentTarget)
    fd.set("subscription_id", subscriptionId)
    const res = await recordSubscriptionPayment(fd)
    setBusy(false)
    if (!res.ok) return setErr(res.error)
    formRef.current?.reset()
    onDone()
  }

  return (
    <Card className="p-4 md:p-6">
      <form ref={formRef} onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-foreground">Record payment for the {fmtDate(dueDate)} cycle</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Pay on the provider&apos;s own billing portal, then record it here. The renewal only counts as paid after an approver confirms it.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={`Amount (${currency})`} htmlFor="pay-amount">
            <Input id="pay-amount" name="amount" type="number" step="0.01" min="0.01" defaultValue={amount || ""} required />
          </Field>
          <Field label="Paid on" htmlFor="pay-date">
            <Input id="pay-date" name="paid_on" type="date" defaultValue={dubaiToday()} required />
          </Field>
          <Field label="Method" htmlFor="pay-method">
            <Select id="pay-method" name="method" defaultValue="provider_portal">
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Transaction reference" htmlFor="pay-ref" hint="Invoice or order number. Never card numbers.">
            <Input id="pay-ref" name="transaction_ref" autoComplete="off" />
          </Field>
          <Field label="Receipt" htmlFor="pay-receipt">
            <Input id="pay-receipt" name="receipt" type="file" accept="image/*,application/pdf" />
          </Field>
          <Field label="Invoice" htmlFor="pay-invoice">
            <Input id="pay-invoice" name="invoice" type="file" accept="image/*,application/pdf" />
          </Field>
        </div>
        <Field label="Note" htmlFor="pay-note">
          <Textarea id="pay-note" name="note" rows={2} />
        </Field>
        {err ? (
          <p role="alert" className="text-sm text-red-300">
            {err}
          </p>
        ) : null}
        <Button type="submit" disabled={busy} className="self-start">
          {busy ? "Saving..." : "Record payment"}
        </Button>
      </form>
    </Card>
  )
}

function ResolveDue({
  id,
  status,
  busy,
  run,
}: {
  id: string
  status: string
  busy: boolean
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>
}) {
  const [reason, setReason] = React.useState("")
  const [open, setOpen] = React.useState(false)

  if (status === "paused" || status === "cancelled") {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-muted-foreground">This subscription is {status} and gets no reminders.</p>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => reactivateSubscription(id))}>
          Reactivate
        </Button>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        {open ? "Hide" : "No payment needed this cycle? Skip, pause or cancel"}
      </button>
      {open ? (
        <Card className="flex flex-col gap-3 p-4">
          <Field label="Reason" htmlFor="resolve-reason" hint="Saved to the audit log.">
            <Input id="resolve-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Covered by annual plan" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => resolveSubscriptionDue(id, "skip_cycle", reason))}>
              Skip this cycle
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => resolveSubscriptionDue(id, "pause", reason))}>
              Pause
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => resolveSubscriptionDue(id, "cancel", reason))}>
              Cancel subscription
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  )
}

function UploadAttachment({ subscriptionId, onDone }: { subscriptionId: string; onDone: () => void }) {
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    setErr(null)
    setBusy(true)
    const fd = new FormData(form)
    fd.set("subscription_id", subscriptionId)
    const res = await uploadSubscriptionAttachment(fd)
    setBusy(false)
    if (!res.ok) return setErr(res.error)
    form.reset()
    onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <Field label="Upload document" htmlFor="att-file" className="flex-1">
        <Input id="att-file" name="file" type="file" accept="image/*,application/pdf" required />
      </Field>
      <Field label="Type" htmlFor="att-kind">
        <Select id="att-kind" name="kind" defaultValue="invoice">
          <option value="invoice">Invoice</option>
          <option value="receipt">Receipt</option>
          <option value="contract">Contract</option>
          <option value="other">Other</option>
        </Select>
      </Field>
      <Button type="submit" size="sm" variant="secondary" disabled={busy}>
        {busy ? "Uploading..." : "Upload"}
      </Button>
      {err ? (
        <p role="alert" className="text-sm text-red-300">
          {err}
        </p>
      ) : null}
    </form>
  )
}
