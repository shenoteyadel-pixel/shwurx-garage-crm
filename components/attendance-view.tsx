"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, useTransition } from "react"
import { FileDown, FileSpreadsheet, Loader2, LogIn, LogOut, MapPin, Pencil, Plus, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge, Card, GhostButton, Input, Label, PrimaryButton, Select } from "@/components/ui"
import { roleLabel } from "@/lib/rbac/roles"
import {
  TZ,
  WEEKDAYS,
  formatDuration,
  formatTime,
  isoToLocalHHMM,
  lateMinutesFor,
  shiftMinutes,
  workedMinutes,
  type AttendanceRecord,
  type AttendanceSettings,
  type AttendanceStatus,
  type EmployeeSummary,
  type StaffMember,
} from "@/lib/attendance"
import {
  checkIn,
  checkOut,
  deleteAttendanceRecord,
  saveAttendanceSettings,
  saveManualRecord,
} from "@/lib/actions-attendance"
import { buildAttendancePdf, downloadAttendanceCsv } from "@/components/attendance-pdf"

type Company = { name: string; trn: string | null; address: string | null }
type Tab = "me" | "today" | "report" | "records" | "settings"

const STATUS_STYLE: Record<AttendanceStatus, string> = {
  present: "border-primary/40 bg-primary/10 text-primary",
  late: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  absent: "border-destructive/40 bg-destructive/10 text-destructive",
  leave: "border-border bg-muted text-muted-foreground",
  sick: "border-border bg-muted text-muted-foreground",
  off: "border-border bg-muted text-muted-foreground",
}

function StatusBadge({ status }: { status: AttendanceStatus | "in" | "out" | "not_in" }) {
  const map = {
    in: { label: "On shift", cls: STATUS_STYLE.present },
    out: { label: "Checked out", cls: STATUS_STYLE.leave },
    not_in: { label: "Not checked in", cls: STATUS_STYLE.absent },
  } as const
  const m = status in map ? map[status as keyof typeof map] : { label: status, cls: STATUS_STYLE[status as AttendanceStatus] }
  return <Badge className={cn("capitalize", m.cls)}>{m.label}</Badge>
}

function getPosition(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  })
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export function AttendanceView(props: {
  me: { id: string; name: string }
  today: string
  month: string
  settings: AttendanceSettings
  staff: StaffMember[]
  records: AttendanceRecord[]
  todayRecords: AttendanceRecord[]
  summaries: EmployeeSummary[]
  canViewAll: boolean
  canManage: boolean
  canEditSettings: boolean
  company: Company
}) {
  const [tab, setTab] = useState<Tab>("me")
  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "me", label: "My attendance", show: true },
    { key: "today", label: "Today", show: props.canViewAll },
    { key: "report", label: "Monthly report", show: props.canViewAll },
    { key: "records", label: "Records", show: props.canViewAll },
    { key: "settings", label: "Shift settings", show: props.canEditSettings },
  ]

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-balance">Attendance</h1>
        <p className="text-sm text-muted-foreground">
          Shift {props.settings.shift_start}–{props.settings.shift_end} · {props.settings.attendance_grace_minutes} min grace ·
          Off: {props.settings.attendance_off_days.map((d) => WEEKDAYS[d]).join(", ") || "none"}
        </p>
      </header>

      {tabs.filter((t) => t.show).length > 1 && (
        <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label="Attendance sections">
          {tabs
            .filter((t) => t.show)
            .map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-current={tab === t.key ? "page" : undefined}
                className={cn(
                  "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
        </nav>
      )}

      {tab === "me" && <MyAttendance {...props} />}
      {tab === "today" && <TodayBoard {...props} />}
      {tab === "report" && <MonthlyReport {...props} />}
      {tab === "records" && <RecordsTable {...props} />}
      {tab === "settings" && <SettingsForm settings={props.settings} />}
    </div>
  )
}

/* ---------------- My attendance (clock card) ---------------- */

function MyAttendance({
  me,
  today,
  month,
  settings,
  records,
  todayRecords,
  summaries,
}: Parameters<typeof AttendanceView>[0]) {
  const router = useRouter()
  const now = useNow()
  const [pending, start] = useTransition()
  const [note, setNote] = useState("")
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const mine = todayRecords.find((r) => r.user_id === me.id)
  const openShift = mine?.check_in_at && !mine.check_out_at
  const done = mine?.check_in_at && mine.check_out_at
  const blocked = mine && ["leave", "sick", "off"].includes(mine.status)
  const mySummary = summaries.find((s) => s.userId === me.id)
  const myRecords = records.filter((r) => r.user_id === me.id)

  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(now)
  const dateLabel = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(now)

  const act = (kind: "in" | "out") =>
    start(async () => {
      setMsg(null)
      const pos = await getPosition()
      const res = kind === "in" ? await checkIn(pos, note) : await checkOut(pos, note)
      if (res.ok) {
        setNote("")
        setMsg({ ok: true, text: res.message ?? "Saved" })
        router.refresh()
      } else setMsg({ ok: false, text: res.error })
    })

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="flex flex-col gap-5 p-6 lg:col-span-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">{dateLabel}</p>
            <p className="font-mono text-5xl font-semibold tabular-nums tracking-tight" suppressHydrationWarning>
              {clock}
            </p>
          </div>
          <StatusBadge status={blocked ? mine!.status : openShift ? "in" : done ? "out" : "not_in"} />
        </div>

        <dl className="grid grid-cols-3 gap-3 border-y border-border py-4 text-sm">
          <div className="flex flex-col gap-1">
            <dt className="text-xs text-muted-foreground">Check in</dt>
            <dd className="font-medium tabular-nums">{formatTime(mine?.check_in_at ?? null)}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs text-muted-foreground">Check out</dt>
            <dd className="font-medium tabular-nums">{formatTime(mine?.check_out_at ?? null)}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs text-muted-foreground">Worked today</dt>
            <dd className="font-medium tabular-nums">{mine?.check_in_at ? formatDuration(workedMinutes(mine, now)) : "—"}</dd>
          </div>
        </dl>

        {!done && !blocked && (
          <div className="flex flex-col gap-3">
            <Input
              placeholder="Note (optional)"
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              aria-label="Attendance note"
            />
            <PrimaryButton
              type="button"
              onClick={() => act(openShift ? "out" : "in")}
              disabled={pending}
              className={cn("h-14 text-base", openShift && "bg-foreground text-background hover:bg-foreground/90")}
            >
              {pending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : openShift ? (
                <LogOut className="h-5 w-5" />
              ) : (
                <LogIn className="h-5 w-5" />
              )}
              {openShift ? "Check out" : "Check in"}
            </PrimaryButton>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {settings.attendance_require_location
                ? `Location required — you must be within ${settings.geofence_radius_m} m of the workshop.`
                : "Your location is recorded with each check-in if you allow it."}
            </p>
          </div>
        )}
        {done && <p className="text-sm text-muted-foreground">Shift complete for today. See you tomorrow.</p>}
        {blocked && <p className="text-sm text-muted-foreground">Today is recorded as {mine!.status}.</p>}
        {msg && (
          <p role="status" className={cn("text-sm", msg.ok ? "text-primary" : "text-destructive")}>
            {msg.text}
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-4 p-6 lg:col-span-2">
        <h2 className="text-base font-semibold">This month</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          {[
            ["Days present", String(mySummary?.present ?? 0)],
            ["Late arrivals", String(mySummary?.late ?? 0)],
            ["Absent", String(mySummary?.absent ?? 0)],
            ["Leave / sick", String((mySummary?.leave ?? 0) + (mySummary?.sick ?? 0))],
            ["Hours worked", formatDuration(mySummary?.workedMinutes ?? 0)],
            ["Overtime", formatDuration(mySummary?.overtimeMinutes ?? 0)],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="text-lg font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="flex flex-col gap-3 p-5 lg:col-span-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">My history</h2>
          <MonthPicker month={month} today={today} />
        </div>
        <RecordRows records={myRecords} settings={settings} names={new Map([[me.id, me.name]])} hideName />
      </Card>
    </div>
  )
}

/* ---------------- Today board ---------------- */

function TodayBoard({ staff, todayRecords, settings, today }: Parameters<typeof AttendanceView>[0]) {
  const now = useNow(30000)
  const byUser = new Map(todayRecords.map((r) => [r.user_id, r]))
  const isOffDay = settings.attendance_off_days.includes(new Date(`${today}T12:00:00+04:00`).getUTCDay())
  const onShift = todayRecords.filter((r) => r.check_in_at && !r.check_out_at).length
  const late = todayRecords.filter((r) => lateMinutesFor(r.check_in_at, settings) > 0).length
  const notIn = staff.filter((s) => !byUser.get(s.id)).length

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          ["On shift now", onShift],
          ["Late today", late],
          [isOffDay ? "Not in (off day)" : "Not checked in", notIn],
        ].map(([k, v]) => (
          <Card key={String(k)} className="flex flex-col gap-1 p-4">
            <span className="text-xs text-muted-foreground">{k}</span>
            <span className="text-2xl font-semibold tabular-nums">{v}</span>
          </Card>
        ))}
      </div>
      <Card className="overflow-x-auto p-5">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-2 font-medium">Employee</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium">In</th>
              <th className="py-2 font-medium">Out</th>
              <th className="py-2 text-right font-medium">Late</th>
              <th className="py-2 text-right font-medium">Worked</th>
              <th className="py-2 text-right font-medium">Distance</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => {
              const r = byUser.get(s.id)
              const lateMin = lateMinutesFor(r?.check_in_at ?? null, settings)
              const status = !r
                ? "not_in"
                : ["leave", "sick", "off", "absent"].includes(r.status)
                  ? r.status
                  : r.check_out_at
                    ? "out"
                    : "in"
              return (
                <tr key={s.id} className="border-t border-border">
                  <td className="py-2">
                    <div className="font-medium">{s.full_name || "Unnamed"}</div>
                    <div className="text-xs text-muted-foreground">{roleLabel(s.role)}</div>
                  </td>
                  <td className="py-2">
                    <StatusBadge status={status as AttendanceStatus} />
                  </td>
                  <td className="py-2 tabular-nums">{formatTime(r?.check_in_at ?? null)}</td>
                  <td className="py-2 tabular-nums">{formatTime(r?.check_out_at ?? null)}</td>
                  <td className={cn("py-2 text-right tabular-nums", lateMin > 0 && "text-amber-600 dark:text-amber-400")}>
                    {lateMin > 0 ? `${lateMin}m` : "—"}
                  </td>
                  <td className="py-2 text-right tabular-nums">{r?.check_in_at ? formatDuration(workedMinutes(r, now)) : "—"}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">
                    {r?.check_in_distance_m != null ? `${r.check_in_distance_m} m` : "—"}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

/* ---------------- Monthly report ---------------- */

function MonthlyReport({ month, today, summaries, records, staff, settings, company }: Parameters<typeof AttendanceView>[0]) {
  const [busy, setBusy] = useState(false)
  const totals = summaries.reduce(
    (a, s) => ({ w: a.w + s.workedMinutes, ot: a.ot + s.overtimeMinutes, late: a.late + s.late, absent: a.absent + s.absent }),
    { w: 0, ot: 0, late: 0, absent: 0 },
  )

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker month={month} today={today} />
        <div className="flex gap-2">
          <GhostButton type="button" onClick={() => downloadAttendanceCsv(month, records, staff, settings)}>
            <FileSpreadsheet className="h-4 w-4" />
            CSV
          </GhostButton>
          <PrimaryButton
            type="button"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await buildAttendancePdf({ company, month, settings, summaries, records, staff })
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            Download PDF
          </PrimaryButton>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Scheduled shift {formatDuration(shiftMinutes(settings))} per day. Overtime is time worked beyond that. Missing
        working days count as absent.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-2 font-medium">Employee</th>
              <th className="py-2 text-right font-medium">Present</th>
              <th className="py-2 text-right font-medium">Late</th>
              <th className="py-2 text-right font-medium">Late time</th>
              <th className="py-2 text-right font-medium">Absent</th>
              <th className="py-2 text-right font-medium">Leave</th>
              <th className="py-2 text-right font-medium">Sick</th>
              <th className="py-2 text-right font-medium">No check-out</th>
              <th className="py-2 text-right font-medium">Hours</th>
              <th className="py-2 text-right font-medium">Overtime</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => (
              <tr key={s.userId} className="border-t border-border">
                <td className="py-2">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{roleLabel(s.role)}</div>
                </td>
                <td className="py-2 text-right tabular-nums">{s.present}</td>
                <td className="py-2 text-right tabular-nums">{s.late}</td>
                <td className="py-2 text-right tabular-nums">{formatDuration(s.lateMinutes)}</td>
                <td className={cn("py-2 text-right tabular-nums", s.absent > 0 && "text-destructive")}>{s.absent}</td>
                <td className="py-2 text-right tabular-nums">{s.leave}</td>
                <td className="py-2 text-right tabular-nums">{s.sick}</td>
                <td className={cn("py-2 text-right tabular-nums", s.missingCheckout > 0 && "text-amber-600 dark:text-amber-400")}>
                  {s.missingCheckout}
                </td>
                <td className="py-2 text-right tabular-nums">{formatDuration(s.workedMinutes)}</td>
                <td className="py-2 text-right tabular-nums">{formatDuration(s.overtimeMinutes)}</td>
              </tr>
            ))}
            <tr className="border-t border-border font-semibold">
              <td className="py-2">Total</td>
              <td />
              <td className="py-2 text-right tabular-nums">{totals.late}</td>
              <td />
              <td className="py-2 text-right tabular-nums">{totals.absent}</td>
              <td colSpan={3} />
              <td className="py-2 text-right tabular-nums">{formatDuration(totals.w)}</td>
              <td className="py-2 text-right tabular-nums">{formatDuration(totals.ot)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ---------------- Records (edit) ---------------- */

type Draft = {
  userId: string
  workDate: string
  checkIn: string
  checkOut: string
  status: AttendanceStatus
  breakMinutes: number
  reason: string
}

function RecordsTable({ records, staff, settings, month, today, canManage }: Parameters<typeof AttendanceView>[0]) {
  const router = useRouter()
  const [employee, setEmployee] = useState("")
  const [draft, setDraft] = useState<Draft | null>(null)
  const names = useMemo(() => new Map(staff.map((s) => [s.id, s.full_name || "Unnamed"])), [staff])
  const shown = employee ? records.filter((r) => r.user_id === employee) : records

  const onDelete = async (r: AttendanceRecord) => {
    const reason = window.prompt(`Delete ${names.get(r.user_id)}'s record for ${r.work_date}? Enter a reason:`)
    if (!reason) return
    const res = await deleteAttendanceRecord(r.id, reason)
    if (!res.ok) window.alert(res.error)
    else router.refresh()
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker month={month} today={today} />
          <Select value={employee} onChange={(e) => setEmployee(e.target.value)} className="w-52" aria-label="Filter employee">
            <option value="">All employees</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name || "Unnamed"}
              </option>
            ))}
          </Select>
        </div>
        {canManage && (
          <PrimaryButton
            type="button"
            size="sm"
            onClick={() =>
              setDraft({
                userId: employee || staff[0]?.id || "",
                workDate: today,
                checkIn: settings.shift_start,
                checkOut: settings.shift_end,
                status: "present",
                breakMinutes: 0,
                reason: "",
              })
            }
          >
            <Plus className="h-4 w-4" />
            Add record
          </PrimaryButton>
        )}
      </div>

      {draft && <RecordEditor draft={draft} setDraft={setDraft} staff={staff} onSaved={() => router.refresh()} />}

      <RecordRows
        records={shown}
        settings={settings}
        names={names}
        onEdit={
          canManage
            ? (r) =>
                setDraft({
                  userId: r.user_id,
                  workDate: r.work_date,
                  checkIn: isoToLocalHHMM(r.check_in_at),
                  checkOut: isoToLocalHHMM(r.check_out_at),
                  status: r.status,
                  breakMinutes: r.break_minutes,
                  reason: "",
                })
            : undefined
        }
        onDelete={canManage ? onDelete : undefined}
      />
    </Card>
  )
}

function RecordEditor({
  draft,
  setDraft,
  staff,
  onSaved,
}: {
  draft: Draft
  setDraft: (d: Draft | null) => void
  staff: StaffMember[]
  onSaved: () => void
}) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v })
  const works = draft.status === "present" || draft.status === "late"

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border border-border bg-muted/30 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          setErr(null)
          const res = await saveManualRecord(draft)
          if (!res.ok) return setErr(res.error)
          setDraft(null)
          onSaved()
        })
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Manual attendance entry</h3>
        <button type="button" onClick={() => setDraft(null)} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="att-emp">Employee</Label>
          <Select id="att-emp" value={draft.userId} onChange={(e) => set("userId", e.target.value)}>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name || "Unnamed"}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="att-date">Date</Label>
          <Input id="att-date" type="date" value={draft.workDate} onChange={(e) => set("workDate", e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="att-status">Status</Label>
          <Select id="att-status" value={draft.status} onChange={(e) => set("status", e.target.value as AttendanceStatus)}>
            {(["present", "late", "absent", "leave", "sick", "off"] as const).map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </Select>
        </div>
        {works && (
          <>
            <div>
              <Label htmlFor="att-in">Check in</Label>
              <Input id="att-in" type="time" value={draft.checkIn} onChange={(e) => set("checkIn", e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="att-out">Check out</Label>
              <Input id="att-out" type="time" value={draft.checkOut} onChange={(e) => set("checkOut", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="att-break">Break (minutes)</Label>
              <Input
                id="att-break"
                type="number"
                min={0}
                max={600}
                value={draft.breakMinutes}
                onChange={(e) => set("breakMinutes", Number(e.target.value))}
              />
            </div>
          </>
        )}
      </div>
      <div>
        <Label htmlFor="att-reason">Reason for correction (saved to audit log)</Label>
        <Input
          id="att-reason"
          value={draft.reason}
          onChange={(e) => set("reason", e.target.value)}
          placeholder="e.g. Forgot to check out, confirmed by supervisor"
          required
          minLength={3}
          maxLength={300}
        />
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <div className="flex justify-end gap-2">
        <GhostButton type="button" onClick={() => setDraft(null)}>
          Cancel
        </GhostButton>
        <PrimaryButton type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save record
        </PrimaryButton>
      </div>
    </form>
  )
}

function RecordRows({
  records,
  settings,
  names,
  hideName,
  onEdit,
  onDelete,
}: {
  records: AttendanceRecord[]
  settings: AttendanceSettings
  names: Map<string, string>
  hideName?: boolean
  onEdit?: (r: AttendanceRecord) => void
  onDelete?: (r: AttendanceRecord) => void
}) {
  if (records.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No attendance records for this month.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-2 font-medium">Date</th>
            {!hideName && <th className="py-2 font-medium">Employee</th>}
            <th className="py-2 font-medium">Status</th>
            <th className="py-2 font-medium">In</th>
            <th className="py-2 font-medium">Out</th>
            <th className="py-2 text-right font-medium">Worked</th>
            <th className="py-2 text-right font-medium">Late</th>
            <th className="py-2 font-medium">Note</th>
            {(onEdit || onDelete) && <th className="py-2" />}
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const late = lateMinutesFor(r.check_in_at, settings)
            return (
              <tr key={r.id} className="border-t border-border">
                <td className="py-2 tabular-nums">
                  {r.work_date}
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {WEEKDAYS[new Date(`${r.work_date}T12:00:00+04:00`).getUTCDay()]}
                  </span>
                </td>
                {!hideName && <td className="py-2 font-medium">{names.get(r.user_id) ?? "—"}</td>}
                <td className="py-2">
                  <StatusBadge status={r.status} />
                </td>
                <td className="py-2 tabular-nums">{formatTime(r.check_in_at)}</td>
                <td className="py-2 tabular-nums">
                  {r.check_in_at && !r.check_out_at ? <span className="text-amber-600 dark:text-amber-400">open</span> : formatTime(r.check_out_at)}
                </td>
                <td className="py-2 text-right tabular-nums">{r.check_in_at && r.check_out_at ? formatDuration(workedMinutes(r)) : "—"}</td>
                <td className="py-2 text-right tabular-nums">{late ? `${late}m` : "—"}</td>
                <td className="max-w-56 truncate py-2 text-xs text-muted-foreground">
                  {r.source === "manual" && <span className="mr-1 font-medium text-foreground">Edited:</span>}
                  {r.edit_reason || [r.check_in_note, r.check_out_note].filter(Boolean).join(" / ") || ""}
                </td>
                {(onEdit || onDelete) && (
                  <td className="py-2">
                    <div className="flex justify-end gap-1">
                      {onEdit && (
                        <button type="button" onClick={() => onEdit(r)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">Edit</span>
                        </button>
                      )}
                      {onDelete && (
                        <button type="button" onClick={() => onDelete(r)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ---------------- Settings ---------------- */

function SettingsForm({ settings }: { settings: AttendanceSettings }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [f, setF] = useState({
    shiftStart: settings.shift_start,
    shiftEnd: settings.shift_end,
    graceMinutes: settings.attendance_grace_minutes,
    offDays: settings.attendance_off_days,
    workshopLat: settings.workshop_lat,
    workshopLng: settings.workshop_lng,
    radius: settings.geofence_radius_m,
    requireLocation: settings.attendance_require_location,
  })
  const [locating, setLocating] = useState(false)

  return (
    <Card className="flex flex-col gap-5 p-5">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            const res = await saveAttendanceSettings(f)
            setMsg(res.ok ? { ok: true, text: res.message ?? "Saved" } : { ok: false, text: res.error })
            if (res.ok) router.refresh()
          })
        }}
      >
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Working hours</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="s-start">Shift start</Label>
              <Input id="s-start" type="time" value={f.shiftStart} onChange={(e) => setF({ ...f, shiftStart: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="s-end">Shift end</Label>
              <Input id="s-end" type="time" value={f.shiftEnd} onChange={(e) => setF({ ...f, shiftEnd: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="s-grace">Late grace (minutes)</Label>
              <Input
                id="s-grace"
                type="number"
                min={0}
                max={120}
                value={f.graceMinutes}
                onChange={(e) => setF({ ...f, graceMinutes: Number(e.target.value) })}
              />
            </div>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Weekly off days</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d, i) => {
                const on = f.offDays.includes(i)
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setF({ ...f, offDays: on ? f.offDays.filter((x) => x !== i) : [...f.offDays, i] })}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {d}
                  </button>
                )
              })}
            </div>
          </fieldset>
        </section>

        <section className="flex flex-col gap-3 border-t border-border pt-5">
          <h2 className="text-base font-semibold">Workshop location</h2>
          <p className="text-xs text-muted-foreground">
            Open this page at the workshop and press &quot;Use my location&quot;. Staff check-ins will record their distance from here.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="s-lat">Latitude</Label>
              <Input
                id="s-lat"
                type="number"
                step="any"
                value={f.workshopLat ?? ""}
                onChange={(e) => setF({ ...f, workshopLat: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="s-lng">Longitude</Label>
              <Input
                id="s-lng"
                type="number"
                step="any"
                value={f.workshopLng ?? ""}
                onChange={(e) => setF({ ...f, workshopLng: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="s-radius">Allowed radius (m)</Label>
              <Input
                id="s-radius"
                type="number"
                min={50}
                max={5000}
                value={f.radius}
                onChange={(e) => setF({ ...f, radius: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <GhostButton
              type="button"
              disabled={locating}
              onClick={async () => {
                setLocating(true)
                const p = await getPosition()
                setLocating(false)
                if (p) setF((cur) => ({ ...cur, workshopLat: p.lat, workshopLng: p.lng }))
                else setMsg({ ok: false, text: "Could not get your location. Allow location access and try again." })
              }}
            >
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              Use my location
            </GhostButton>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={f.requireLocation}
                onChange={(e) => setF({ ...f, requireLocation: e.target.checked })}
              />
              Only allow check-in inside the radius
            </label>
          </div>
        </section>

        {msg && <p className={cn("text-sm", msg.ok ? "text-primary" : "text-destructive")}>{msg.text}</p>}
        <div className="flex justify-end">
          <PrimaryButton type="submit" size="sm" disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save settings
          </PrimaryButton>
        </div>
      </form>
    </Card>
  )
}

/* ---------------- Month picker ---------------- */

function MonthPicker({ month, today }: { month: string; today: string }) {
  const router = useRouter()
  return (
    <Input
      type="month"
      value={month}
      max={today.slice(0, 7)}
      onChange={(e) => e.target.value && router.push(`/attendance?month=${e.target.value}`)}
      className="w-44"
      aria-label="Select month"
    />
  )
}
