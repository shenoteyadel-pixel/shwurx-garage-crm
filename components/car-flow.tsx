"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ZONES, LIFT_BAYS, STAGE_MAP, type Stage, type Zone } from "@/lib/constants"
import { cn, relativeHours } from "@/lib/utils"
import { VehicleVisual, BrandLogo } from "@/components/vehicle-visual"
import { UAEPlate } from "@/components/ui"
import { moveJobLocation } from "@/lib/actions"
import type { JobCardData } from "@/components/job-card"
import {
  Wrench,
  Loader2,
  MoveRight,
  Gauge,
  Headset,
  Clock,
  CalendarClock,
  CircleCheck,
  CircleDashed,
  CircleX,
  Wallet,
} from "lucide-react"

type MoveHandler = (job: Job, stage: Stage, liftBay?: string | null) => void
const MoveContext = React.createContext<MoveHandler>(() => {})

type Job = JobCardData

export function CarFlow({ jobs }: { jobs: Job[] }) {
  const router = useRouter()
  const [items, setItems] = React.useState<Job[]>(jobs)
  const [dragId, setDragId] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState<string | null>(null)
  const [dropTarget, setDropTarget] = React.useState<string | null>(null)

  React.useEffect(() => setItems(jobs), [jobs])

  const drag = items.find((j) => j.id === dragId) || null

  async function place(job: Job, stage: Stage, liftBay?: string | null) {
    if (job.stage === stage && (stage !== "repair" || (job.lift_bay ?? null) === (liftBay ?? null))) return
    // optimistic
    setItems((prev) =>
      prev.map((j) => (j.id === job.id ? { ...j, stage, lift_bay: stage === "repair" ? liftBay ?? null : null } : j)),
    )
    setPending(job.id)
    try {
      await moveJobLocation(job.id, stage, liftBay ?? null)
      router.refresh()
    } finally {
      setPending(null)
    }
  }

  const activeCount = items.filter((j) => j.stage !== "delivered").length

  return (
    <MoveContext.Provider value={(job, stage, liftBay) => place(job, stage, liftBay)}>
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Drag a vehicle between zones, or use the move menu on each card. Drop a car onto a lift to assign a bay.
        </p>
        <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          {activeCount} active {activeCount === 1 ? "vehicle" : "vehicles"}
        </span>
      </div>

      <div className="scrollbar-thin flex gap-4 overflow-x-auto pb-4">
        {ZONES.map((zone) => (
          <ZoneColumn
            key={zone.key}
            zone={zone}
            jobs={items.filter((j) => zone.stages.includes(j.stage))}
            dragActive={!!drag}
            dropTarget={dropTarget}
            setDropTarget={setDropTarget}
            pending={pending}
            onDragStart={setDragId}
            onDragEnd={() => {
              setDragId(null)
              setDropTarget(null)
            }}
            onDropStage={(stage) => drag && place(drag, stage)}
            onDropBay={(bay) => drag && place(drag, "repair", bay)}
          />
        ))}
      </div>
    </div>
    </MoveContext.Provider>
  )
}

function ZoneColumn({
  zone,
  jobs,
  dragActive,
  dropTarget,
  setDropTarget,
  pending,
  onDragStart,
  onDragEnd,
  onDropStage,
  onDropBay,
}: {
  zone: Zone
  jobs: Job[]
  dragActive: boolean
  dropTarget: string | null
  setDropTarget: (v: string | null) => void
  pending: string | null
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDropStage: (stage: Stage) => void
  onDropBay: (bay: string) => void
}) {
  const isWorkshop = zone.key === "workshop"
  const primaryStage = zone.stages[0]
  const zoneKey = `zone:${zone.key}`
  const isOver = dropTarget === zoneKey

  return (
    <div
      className={cn(
        "flex w-80 shrink-0 flex-col rounded-xl border bg-card/40 transition",
        isOver ? "border-primary ring-2 ring-primary/40" : "border-border",
      )}
      onDragOver={(e) => {
        if (!dragActive) return
        e.preventDefault()
        setDropTarget(zoneKey)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDropTarget(null)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDropTarget(null)
        if (!isWorkshop) onDropStage(primaryStage)
      }}
    >
      <div className={cn("flex items-center justify-between rounded-t-xl px-3 py-2.5 text-white", zone.bar)}>
        <span className="text-sm font-semibold">{zone.label}</span>
        <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs font-medium">{jobs.length}</span>
      </div>

      {isWorkshop ? (
        <WorkshopBays
          jobs={jobs}
          dropTarget={dropTarget}
          setDropTarget={setDropTarget}
          dragActive={dragActive}
          pending={pending}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDropBay={onDropBay}
        />
      ) : (
        <div className="flex max-h-[560px] flex-col gap-2 overflow-y-auto p-2 scrollbar-thin">
          {jobs.length === 0 && <EmptyHint />}
          {jobs.map((job) => (
            <FlowCard
              key={job.id}
              job={job}
              pending={pending === job.id}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function WorkshopBays({
  jobs,
  dropTarget,
  setDropTarget,
  dragActive,
  pending,
  onDragStart,
  onDragEnd,
  onDropBay,
}: {
  jobs: Job[]
  dropTarget: string | null
  setDropTarget: (v: string | null) => void
  dragActive: boolean
  pending: string | null
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDropBay: (bay: string) => void
}) {
  const byBay = new Map<string, Job>()
  const unassigned: Job[] = []
  for (const j of jobs) {
    if (j.lift_bay && LIFT_BAYS.includes(j.lift_bay)) byBay.set(j.lift_bay, j)
    else unassigned.push(j)
  }

  return (
    <div className="flex max-h-[560px] flex-col gap-2 overflow-y-auto p-2 scrollbar-thin">
      <div className="grid grid-cols-2 gap-2">
        {LIFT_BAYS.map((bay) => {
          const job = byBay.get(bay)
          const key = `bay:${bay}`
          const isOver = dropTarget === key
          return (
            <div
              key={bay}
              onDragOver={(e) => {
                if (!dragActive) return
                e.preventDefault()
                e.stopPropagation()
                setDropTarget(key)
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setDropTarget(null)
                onDropBay(bay)
              }}
              className={cn(
                "relative flex min-h-24 flex-col rounded-lg border-2 border-dashed p-1.5 transition",
                isOver ? "border-primary bg-primary/10" : job ? "border-fuchsia-500/40 bg-fuchsia-500/5" : "border-border bg-background/40",
              )}
            >
              <div className="mb-1 flex items-center gap-1 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Wrench className="h-3 w-3" /> {bay}
              </div>
              {job ? (
                <BayCard job={job} pending={pending === job.id} onDragStart={onDragStart} onDragEnd={onDragEnd} />
              ) : (
                <div className="flex flex-1 items-center justify-center text-[10px] text-muted-foreground">Empty</div>
              )}
            </div>
          )
        })}
      </div>

      {unassigned.length > 0 && (
        <div className="mt-1 rounded-lg border border-border bg-background/30 p-1.5">
          <div className="mb-1 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            In repair — no bay
          </div>
          <div className="flex flex-col gap-2">
            {unassigned.map((job) => (
              <FlowCard
                key={job.id}
                job={job}
                pending={pending === job.id}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyHint() {
  return <p className="px-2 py-8 text-center text-xs text-muted-foreground">Drop a vehicle here</p>
}

function DragHandleCard({
  job,
  pending,
  onDragStart,
  onDragEnd,
  children,
}: {
  job: Job
  pending: boolean
  onDragStart: (id: string) => void
  onDragEnd: () => void
  children: React.ReactNode
}) {
  return (
    <div
      draggable={!pending}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move"
        e.dataTransfer.setData("text/plain", job.id)
        onDragStart(job.id)
      }}
      onDragEnd={onDragEnd}
      className={cn("group relative cursor-grab active:cursor-grabbing", pending && "opacity-50")}
    >
      {pending ? (
        <div className="absolute right-1.5 top-1.5 z-10">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        </div>
      ) : (
        <MoveMenu job={job} />
      )}
      {children}
    </div>
  )
}

function MoveMenu({ job }: { job: Job }) {
  const move = React.useContext(MoveContext)
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  return (
    <div ref={ref} className="absolute right-1 top-1 z-20">
      <button
        type="button"
        aria-label="Move vehicle"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="rounded-md border border-border bg-card/90 p-1 text-muted-foreground opacity-0 transition hover:text-foreground group-hover:opacity-100 aria-expanded:opacity-100"
        aria-expanded={open}
      >
        <MoveRight className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-7 max-h-72 w-52 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-xl scrollbar-thin">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Move to zone
          </div>
          {ZONES.map((z) => (
            <button
              key={z.key}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                move(job, z.stages[0])
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
            >
              <span className={cn("h-2 w-2 rounded-full", z.bar)} />
              {z.label}
            </button>
          ))}
          <div className="mt-1 border-t border-border px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Assign lift bay
          </div>
          <div className="grid grid-cols-3 gap-1 px-1 pb-1">
            {LIFT_BAYS.map((bay) => (
              <button
                key={bay}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                  move(job, "repair", bay)
                }}
                className={cn(
                  "rounded-md border px-1 py-1 text-[10px] hover:bg-muted",
                  job.lift_bay === bay ? "border-primary text-primary" : "border-border text-muted-foreground",
                )}
              >
                {bay.replace("Bay ", "B")}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Time-in-shop, compact (e.g. "3h" / "2d"). */
function timeInShop(createdAt: string): string {
  const hrs = relativeHours(createdAt)
  return hrs < 24 ? `${Math.round(hrs)}h` : `${Math.round(hrs / 24)}d`
}

/** Expected completion — short date + overdue awareness. */
function completionLabel(iso?: string | null): { text: string; overdue: boolean } | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const overdue = d.getTime() < Date.now()
  const text = d.toLocaleDateString([], { day: "numeric", month: "short" })
  return { text, overdue }
}

const APPROVAL_BADGE: Record<JobCardData["approval_status"], { label: string; className: string; Icon: typeof CircleCheck }> = {
  approved: { label: "Approved", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300", Icon: CircleCheck },
  rejected: { label: "Declined", className: "border-red-500/40 bg-red-500/10 text-red-300", Icon: CircleX },
  pending: { label: "Approval", className: "border-amber-500/40 bg-amber-500/10 text-amber-300", Icon: CircleDashed },
}

const PAYMENT_BADGE: Record<NonNullable<JobCardData["payment_status"]>, { label: string; className: string } | null> = {
  none: null,
  unpaid: { label: "Unpaid", className: "border-red-500/40 bg-red-500/10 text-red-300" },
  partial: { label: "Part-paid", className: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  paid: { label: "Paid", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
}

/** A single labelled meta cell (icon + value) used in the card's info grid. */
function MetaCell({
  Icon,
  label,
  value,
  emphasize,
}: {
  Icon: typeof Gauge
  label: string
  value: string
  emphasize?: boolean
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="text-[9px] uppercase leading-none tracking-wide text-muted-foreground">{label}</div>
        <div className={cn("truncate text-[11px] leading-tight", emphasize ? "font-medium text-foreground" : "text-foreground/90")}>
          {value}
        </div>
      </div>
    </div>
  )
}

/**
 * Standardized premium vehicle card — every job renders the same layout with
 * key operational info in fixed positions: identity + stage, photo + plate,
 * vehicle spec, customer, mileage/advisor/technician, and approval + payment
 * status. This is the single source-of-truth tile used across the board.
 */
function FlowCard({
  job,
  pending,
  onDragStart,
  onDragEnd,
}: {
  job: Job
  pending: boolean
  onDragStart: (id: string) => void
  onDragEnd: () => void
}) {
  const vehicle = [job.vehicle_year, job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ") || "Vehicle"
  const stage = STAGE_MAP[job.stage] ?? {
    key: job.stage,
    label: String(job.stage ?? "Unknown"),
    short: String(job.stage ?? "Unknown"),
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    chip: "bg-muted/40 text-muted-foreground border-border",
  }
  const approval = APPROVAL_BADGE[job.approval_status] ?? APPROVAL_BADGE.pending
  const payment = job.payment_status ? PAYMENT_BADGE[job.payment_status] : null
  const completion = completionLabel(job.estimated_completion)

  return (
    <DragHandleCard job={job} pending={pending} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="overflow-hidden rounded-xl border border-border bg-card transition hover:border-primary/50 hover:shadow-lg hover:shadow-black/20">
        {/* Identity + stage */}
        <div className="flex items-center justify-between gap-2 px-2.5 pt-2">
          <span className="font-mono text-[11px] font-medium text-muted-foreground">{job.job_number}</span>
          <span className={cn("flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]", stage.chip)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", stage.dot)} />
            {stage.short}
          </span>
        </div>

        {/* Photo with plate directly beneath */}
        <div className="relative mt-2 bg-gradient-to-b from-muted/40 to-card">
          <VehicleVisual
            coverPhoto={job.cover}
            make={job.vehicle_make}
            model={job.vehicle_model}
            bodyType={job.body_type}
            color={job.color}
            className="h-24 w-full"
          />
          {(job.plate_emirate || job.plate_code || job.plate_number) && (
            <div className="flex justify-center py-1">
              <UAEPlate
                emirate={job.plate_emirate}
                code={job.plate_code}
                number={job.plate_number}
                className="h-6 text-[11px]"
              />
            </div>
          )}
        </div>

        <div className="space-y-2 p-2.5 pt-2">
          {/* Vehicle spec */}
          <div className="flex items-center gap-1.5">
            <BrandLogo make={job.vehicle_make} size={20} className="shrink-0" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold leading-tight">{vehicle}</div>
              {job.variant && <div className="truncate text-[10px] text-muted-foreground">{job.variant}</div>}
            </div>
          </div>

          {/* Customer */}
          <div className="truncate text-xs text-foreground/90">{job.customer_name}</div>

          {/* Meta grid: mileage, advisor, technician, time in shop */}
          <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 border-t border-border pt-2">
            <MetaCell
              Icon={Gauge}
              label="Mileage"
              value={typeof job.mileage === "number" ? `${job.mileage.toLocaleString()} km` : "—"}
            />
            <MetaCell Icon={Clock} label="In shop" value={timeInShop(job.created_at)} />
            <MetaCell Icon={Headset} label="Advisor" value={job.advisor || "Unassigned"} emphasize={!!job.advisor} />
            <MetaCell
              Icon={Wrench}
              label="Technician"
              value={job.technician || "Unassigned"}
              emphasize={!!job.technician}
            />
          </div>

          {/* Status row: approval + payment + expected completion */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
            <span className={cn("flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]", approval.className)}>
              <approval.Icon className="h-3 w-3" />
              {approval.label}
            </span>
            {payment && (
              <span className={cn("flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]", payment.className)}>
                <Wallet className="h-3 w-3" />
                {payment.label}
              </span>
            )}
            {completion && (
              <span
                className={cn(
                  "ml-auto flex items-center gap-1 text-[10px]",
                  completion.overdue ? "font-medium text-red-400" : "text-muted-foreground",
                )}
                title="Expected completion"
              >
                <CalendarClock className="h-3 w-3" />
                {completion.text}
              </span>
            )}
          </div>

          <Link
            href={`/jobs/${job.id}`}
            className="block w-full rounded-md border border-border bg-background/60 py-1 text-center text-[11px] font-medium text-primary transition hover:bg-primary/10"
            onClick={(e) => e.stopPropagation()}
          >
            Open job
          </Link>
        </div>
      </div>
    </DragHandleCard>
  )
}

function BayCard({
  job,
  pending,
  onDragStart,
  onDragEnd,
}: {
  job: Job
  pending: boolean
  onDragStart: (id: string) => void
  onDragEnd: () => void
}) {
  const vehicle = [job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ") || "Vehicle"
  return (
    <DragHandleCard job={job} pending={pending} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex flex-1 flex-col gap-1 rounded-md bg-card p-1.5">
        <VehicleVisual
          coverPhoto={job.cover}
          make={job.vehicle_make}
          model={job.vehicle_model}
          bodyType={job.body_type}
          color={job.color}
          className="h-12 w-full rounded"
        />
        {(job.plate_emirate || job.plate_code || job.plate_number) && (
          <div className="flex justify-center">
            <UAEPlate
              emirate={job.plate_emirate}
              code={job.plate_code}
              number={job.plate_number}
              className="h-5 text-[9px]"
            />
          </div>
        )}
        <div className="flex items-center gap-1">
          <BrandLogo make={job.vehicle_make} size={14} className="shrink-0" />
          <span className="truncate text-[11px] font-medium">{vehicle}</span>
        </div>
        <Link
          href={`/jobs/${job.id}`}
          className="truncate text-[10px] text-muted-foreground hover:text-primary"
          onClick={(e) => e.stopPropagation()}
        >
          {job.customer_name}
        </Link>
      </div>
    </DragHandleCard>
  )
}
