"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, Badge, Button, Input, Label } from "@/components/ui"
import { Modal } from "@/components/modal"
import { formatDate } from "@/lib/utils"
import {
  CalendarClock,
  Car,
  Phone,
  Mail,
  Wrench,
  Check,
  X,
  CalendarCog,
  UserCheck,
  ArrowRight,
} from "lucide-react"
import {
  confirmAppointment,
  rescheduleAppointment,
  cancelAppointment,
  markNoShow,
  convertAppointmentToJob,
  findCustomerForAppointment,
  type AppointmentRow,
  type AppointmentStatus,
  type CustomerMatch,
} from "@/lib/actions-appointments"

const STATUS_META: Record<AppointmentStatus, { label: string; tone: string }> = {
  pending: { label: "New request", tone: "bg-amber-500/15 text-amber-400" },
  confirmed: { label: "Confirmed", tone: "bg-sky-500/15 text-sky-400" },
  rescheduled: { label: "Rescheduled", tone: "bg-violet-500/15 text-violet-300" },
  completed: { label: "Converted", tone: "bg-emerald-500/15 text-emerald-400" },
  cancelled: { label: "Cancelled", tone: "bg-muted text-muted-foreground" },
  no_show: { label: "No-show", tone: "bg-muted text-muted-foreground" },
}

// Display order for the grouped columns/sections.
const GROUPS: { key: string; label: string; statuses: AppointmentStatus[] }[] = [
  { key: "active", label: "Needs action", statuses: ["pending", "confirmed", "rescheduled"] },
  { key: "done", label: "Converted", statuses: ["completed"] },
  { key: "closed", label: "Closed", statuses: ["cancelled", "no_show"] },
]

export function AppointmentsBoard({
  appointments,
  canManage,
}: {
  appointments: AppointmentRow[]
  canManage: boolean
}) {
  const grouped = useMemo(() => {
    return GROUPS.map((g) => ({
      ...g,
      items: appointments.filter((a) => g.statuses.includes(a.status)),
    })).filter((g) => g.items.length > 0)
  }, [appointments])

  return (
    <div className="space-y-8">
      {grouped.map((group) => (
        <section key={group.key}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.label} · {group.items.length}
          </h2>
          <div className="grid gap-3">
            {group.items.map((a) => (
              <AppointmentCard key={a.id} appointment={a} canManage={canManage} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function AppointmentCard({ appointment: a, canManage }: { appointment: AppointmentRow; canManage: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const meta = STATUS_META[a.status]
  const vehicle = [a.vehicle_make, a.vehicle_model, a.vehicle_year].filter(Boolean).join(" ")
  const isActive = ["pending", "confirmed", "rescheduled"].includes(a.status)

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
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-foreground">{a.name}</span>
            <Badge className={meta.tone}>{meta.label}</Badge>
            {a.source ? <Badge className="bg-muted text-muted-foreground">{a.source}</Badge> : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3 w-3" /> {a.phone}
            </span>
            {a.email ? (
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3 w-3" /> {a.email}
              </span>
            ) : null}
            {vehicle ? (
              <span className="inline-flex items-center gap-1">
                <Car className="h-3 w-3" /> {vehicle}
                {a.plate_number ? ` · ${a.plate_number}` : ""}
              </span>
            ) : null}
          </div>
          {a.service_interest ? (
            <div className="mt-2 inline-flex items-center gap-1.5 text-sm text-foreground">
              <Wrench className="h-3.5 w-3.5 text-primary" /> {a.service_interest}
            </div>
          ) : null}
          {a.notes ? <p className="mt-1.5 text-sm text-muted-foreground">{a.notes}</p> : null}
        </div>

        <div className="text-right text-xs text-muted-foreground">
          <div className="inline-flex items-center gap-1">
            <CalendarClock className="h-3 w-3" />
            {a.preferred_date ? formatDate(a.preferred_date) : "No date"}
            {a.preferred_time ? ` · ${a.preferred_time}` : ""}
          </div>
          <div className="mt-1">Received {formatDate(a.created_at)}</div>
          {a.job_id ? (
            <a href={`/jobs/${a.job_id}`} className="mt-1 inline-flex items-center gap-1 text-primary hover:underline">
              View job card <ArrowRight className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}

      {canManage && isActive ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
          {a.status === "pending" || a.status === "rescheduled" ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => confirmAppointment(a.id))}>
              <Check className="h-3.5 w-3.5" /> Confirm
            </Button>
          ) : null}
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setRescheduleOpen(true)}>
            <CalendarCog className="h-3.5 w-3.5" /> Reschedule
          </Button>
          <Button size="sm" variant="success" disabled={pending} onClick={() => setConvertOpen(true)}>
            <UserCheck className="h-3.5 w-3.5" /> Convert to job card
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => markNoShow(a.id))}>
            No-show
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => cancelAppointment(a.id))}>
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
        </div>
      ) : null}

      <RescheduleModal
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        appointment={a}
        pending={pending}
        onSubmit={(date, time) =>
          run(async () => {
            await rescheduleAppointment(a.id, date, time)
            setRescheduleOpen(false)
          })
        }
      />

      <ConvertModal
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        appointment={a}
        onDone={(jobId) => {
          setConvertOpen(false)
          router.push(`/jobs/${jobId}`)
        }}
      />
    </Card>
  )
}

function RescheduleModal({
  open,
  onClose,
  appointment: a,
  pending,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  appointment: AppointmentRow
  pending: boolean
  onSubmit: (date: string, time: string) => void
}) {
  const [date, setDate] = useState(a.preferred_date ?? "")
  const [time, setTime] = useState(a.preferred_time ?? "")

  return (
    <Modal open={open} onClose={onClose} size="sm" title="Reschedule appointment">
      <div className="space-y-4">
        <div>
          <Label htmlFor="rs_date">New date</Label>
          <Input id="rs_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="rs_time">Preferred time</Label>
          <Input
            id="rs_time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="e.g. Morning, 2:00 PM"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={() => onSubmit(date, time)}>
            {pending ? "Saving…" : "Save & mark rescheduled"}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ConvertModal({
  open,
  onClose,
  appointment: a,
  onDone,
}: {
  open: boolean
  onClose: () => void
  appointment: AppointmentRow
  onDone: (jobId: string) => void
}) {
  const [pending, startTransition] = useTransition()
  const [match, setMatch] = useState<CustomerMatch | null>(null)
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // When the modal opens, look for an existing customer with the same phone.
  function ensureChecked() {
    if (checked) return
    startTransition(async () => {
      try {
        const found = await findCustomerForAppointment(a.id)
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
        const res = await convertAppointmentToJob(a.id, { useExistingCustomerId })
        onDone(res.jobId)
      } catch (e) {
        setError((e as Error)?.message ?? "Could not convert this appointment")
      }
    })
  }

  return (
    <Modal open={open} onClose={onClose} size="sm" title="Convert to job card">
      <div className="space-y-4" onFocus={ensureChecked}>
        {!checked ? (
          <button
            type="button"
            onClick={ensureChecked}
            className="text-sm text-primary hover:underline"
          >
            Check for an existing customer…
          </button>
        ) : match ? (
          <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm">
            <p className="font-medium text-foreground">Existing customer found</p>
            <p className="mt-0.5 text-muted-foreground">
              {match.full_name}
              {match.mobile ? ` · ${match.mobile}` : ""}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Link this booking to the existing customer to avoid a duplicate record.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No matching customer found by phone. A new customer will be created from the booking details.
          </p>
        )}

        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="font-medium text-foreground">{a.name}</p>
          <p className="text-muted-foreground">
            {[a.vehicle_make, a.vehicle_model, a.vehicle_year].filter(Boolean).join(" ") || "Vehicle from booking"}
          </p>
          {a.service_interest ? <p className="mt-1 text-muted-foreground">{a.service_interest}</p> : null}
        </div>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <div className="flex flex-col gap-2">
          {match ? (
            <Button disabled={pending} onClick={() => convert(match.id)}>
              {pending ? "Creating…" : `Use ${match.full_name} & create job`}
            </Button>
          ) : null}
          <Button variant={match ? "outline" : "primary"} disabled={pending} onClick={() => convert(null)}>
            {pending ? "Creating…" : match ? "Create new customer instead" : "Create customer & job card"}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
