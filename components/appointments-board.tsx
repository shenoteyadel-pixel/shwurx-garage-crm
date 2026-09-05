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
  MapPin,
  Truck,
  ExternalLink,
  User,
  MessageCircle,
} from "lucide-react"
import {
  confirmAppointment,
  rescheduleAppointment,
  cancelAppointment,
  markNoShow,
  convertAppointmentToJob,
  findCustomerForAppointment,
  assignDriver,
  updateFulfillmentStatus,
  type AppointmentRow,
  type AppointmentStatus,
  type CustomerMatch,
  type DriverOption,
} from "@/lib/actions-appointments"
import { FULFILLMENT_FLOW, type FulfillmentStatus } from "@/lib/appointments-fulfillment"

// Normalize a UAE-style local number to an international WhatsApp target.
// e.g. "05x xxx xxxx" -> "9715xxxxxxxx". Falls back to raw digits.
function whatsappNumber(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "")
  if (!digits) return ""
  if (digits.startsWith("00")) return digits.slice(2)
  if (digits.startsWith("971")) return digits
  if (digits.startsWith("0")) return "971" + digits.slice(1)
  return digits
}

const contactBtnClass =
  "inline-flex items-center gap-1 rounded-lg border border-input bg-background px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-muted"

const TYPE_META: Record<string, { label: string; tone: string; icon: typeof MapPin }> = {
  pickup: { label: "Pickup", tone: "bg-primary/15 text-primary", icon: MapPin },
  pickup_delivery: { label: "Pickup & Delivery", tone: "bg-primary/15 text-primary", icon: Truck },
  dropoff: { label: "Drop-off", tone: "bg-muted text-muted-foreground", icon: Car },
}

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
  drivers = [],
}: {
  appointments: AppointmentRow[]
  canManage: boolean
  drivers?: DriverOption[]
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
              <AppointmentCard key={a.id} appointment={a} canManage={canManage} drivers={drivers} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function AppointmentCard({
  appointment: a,
  canManage,
  drivers,
}: {
  appointment: AppointmentRow
  canManage: boolean
  drivers: DriverOption[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const meta = STATUS_META[a.status]
  const vehicle = [a.vehicle_make, a.vehicle_model, a.vehicle_year].filter(Boolean).join(" ")
  const isActive = ["pending", "confirmed", "rescheduled"].includes(a.status)
  const type = a.appointment_type ?? "dropoff"
  const typeMeta = TYPE_META[type] ?? TYPE_META.dropoff
  const TypeIcon = typeMeta.icon
  const needsLogistics = type === "pickup" || type === "pickup_delivery"

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
            {needsLogistics ? (
              <Badge className={`inline-flex items-center gap-1 ${typeMeta.tone}`}>
                <TypeIcon className="h-3 w-3" /> {typeMeta.label}
              </Badge>
            ) : null}
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

      {/* Quick contact actions — always available so reception can reach the customer fast. */}
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`tel:${a.phone}`} className={contactBtnClass}>
          <Phone className="h-3.5 w-3.5" /> Call
        </a>
        {whatsappNumber(a.phone) ? (
          <a
            href={`https://wa.me/${whatsappNumber(a.phone)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={contactBtnClass}
          >
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </a>
        ) : null}
        {a.email ? (
          <a href={`mailto:${a.email}`} className={contactBtnClass}>
            <Mail className="h-3.5 w-3.5" /> Email
          </a>
        ) : null}
      </div>

      {needsLogistics ? (
        <LogisticsPanel appointment={a} canManage={canManage} drivers={drivers} run={run} pending={pending} />
      ) : null}

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

function LogisticsPanel({
  appointment: a,
  canManage,
  drivers,
  run,
  pending,
}: {
  appointment: AppointmentRow
  canManage: boolean
  drivers: DriverOption[]
  run: (fn: () => Promise<unknown>) => void
  pending: boolean
}) {
  const isDelivery = a.appointment_type === "pickup_delivery"
  const current = a.fulfillment_status ?? "booked"
  const currentIdx = FULFILLMENT_FLOW.findIndex((s) => s.value === current)

  // For pickup-only bookings, hide the delivery-only stages from the stepper.
  const flow = isDelivery
    ? FULFILLMENT_FLOW
    : FULFILLMENT_FLOW.filter((s) => !["ready_for_delivery", "en_route_delivery", "delivered"].includes(s.value))

  const pickupLine = [a.pickup_address, a.pickup_area, a.pickup_emirate].filter(Boolean).join(", ")
  const pickupWhen = [a.pickup_date ? formatDate(a.pickup_date) : null, a.pickup_time].filter(Boolean).join(" · ")
  const deliveryLine = a.delivery_same_as_pickup
    ? "Same as pickup address"
    : [a.delivery_address].filter(Boolean).join(", ")
  const deliveryWhen = [a.delivery_date ? formatDate(a.delivery_date) : null, a.delivery_time]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Pickup */}
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 text-primary" /> Pickup
          </p>
          <p className="mt-1 text-sm text-foreground">{pickupLine || "Address on file"}</p>
          {a.pickup_building ? <p className="text-xs text-muted-foreground">{a.pickup_building}</p> : null}
          {pickupWhen ? <p className="mt-0.5 text-xs text-muted-foreground">{pickupWhen}</p> : null}
          {a.pickup_instructions ? (
            <p className="mt-1 text-xs italic text-muted-foreground">“{a.pickup_instructions}”</p>
          ) : null}
          {a.pickup_maps_url ? (
            <a
              href={a.pickup_maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Open in Maps <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>

        {/* Delivery */}
        {isDelivery ? (
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Truck className="h-3.5 w-3.5 text-primary" /> Delivery
            </p>
            <p className="mt-1 text-sm text-foreground">{deliveryLine || "Return address on file"}</p>
            {deliveryWhen ? <p className="mt-0.5 text-xs text-muted-foreground">{deliveryWhen}</p> : null}
            {a.delivery_instructions ? (
              <p className="mt-1 text-xs italic text-muted-foreground">“{a.delivery_instructions}”</p>
            ) : null}
            {!a.delivery_same_as_pickup && a.delivery_maps_url ? (
              <a
                href={a.delivery_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Open in Maps <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Driver assignment */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <User className="h-3.5 w-3.5" /> Driver
        </span>
        {a.assigned_driver_name ? (
          <Badge className="bg-emerald-500/15 text-emerald-400">{a.assigned_driver_name}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Not assigned</span>
        )}
        {canManage ? (
          <select
            value={a.assigned_driver_id ?? ""}
            disabled={pending}
            onChange={(e) => {
              const id = e.target.value
              if (id) run(() => assignDriver(a.id, id))
            }}
            className="h-8 rounded-lg border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <option value="">{a.assigned_driver_id ? "Reassign…" : "Assign driver…"}</option>
            {drivers.length === 0 ? (
              <option value="" disabled>
                No drivers available
              </option>
            ) : (
              drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))
            )}
          </select>
        ) : null}
      </div>

      {/* Fulfillment stepper */}
      <div className="mt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fulfillment</p>
        <div className="flex flex-wrap gap-1.5">
          {flow.map((s) => {
            const idx = FULFILLMENT_FLOW.findIndex((f) => f.value === s.value)
            const done = idx <= currentIdx
            const isCurrent = s.value === current
            return canManage ? (
              <button
                key={s.value}
                type="button"
                disabled={pending || isCurrent}
                onClick={() => run(() => updateFulfillmentStatus(a.id, s.value as FulfillmentStatus))}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition disabled:cursor-default ${
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : done
                      ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {s.label}
              </button>
            ) : (
              <span
                key={s.value}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : done
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {s.label}
              </span>
            )
          })}
        </div>
      </div>
    </div>
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
