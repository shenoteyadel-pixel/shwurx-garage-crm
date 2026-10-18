import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { createServiceClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { ctxCanAny, requireStaff } from "@/lib/rbac/context"
import { roleLabel } from "@/lib/rbac/roles"
import { AppShell } from "@/components/app-shell"
import { Card } from "@/components/ui"
import { cn } from "@/lib/utils"
import { formatDuration, formatTime, localDate } from "@/lib/attendance"
import { buildDailyReport, type DailyStatus } from "@/lib/attendance-report"

export const metadata = { title: "Daily Attendance Report · SHWURX Auto Service Center" }

const STATUS: Record<DailyStatus, { label: string; cls: string }> = {
  on_time: { label: "On time", cls: "border-primary/40 bg-primary/10 text-primary" },
  late: { label: "Late", cls: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  absent: { label: "Absent", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  not_in: { label: "Not checked in", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  leave: { label: "Leave", cls: "border-border bg-muted text-muted-foreground" },
  sick: { label: "Sick", cls: "border-border bg-muted text-muted-foreground" },
  off: { label: "Day off", cls: "border-border bg-muted text-muted-foreground" },
}

function shiftDate(date: string, delta: number) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

export default async function DailyAttendanceReportPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const ctx = await requireStaff()
  if (!ctxCanAny(ctx, ["attendance.view_all", "attendance.manage"])) redirect("/attendance")
  const sp = await searchParams
  const today = localDate()
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today

  const [shellUser, report] = await Promise.all([getShellUser(), buildDailyReport(createServiceClient(), date)])
  const c = report.counts
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  )
  const stats = [
    { label: "Present", value: c.present, sub: `of ${c.total} staff` },
    { label: "Late", value: c.late, sub: "after grace period" },
    { label: date < today ? "Absent" : "Absent / not in", value: c.absent + c.not_in, sub: "no check-in" },
    { label: "Missing check-out", value: c.missingCheckout, sub: date < today ? "forgot to check out" : "still on shift" },
  ]

  return (
    <AppShell user={shellUser}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Link href="/attendance" className="text-sm text-muted-foreground hover:text-foreground">
              {"← Attendance"}
            </Link>
            <h1 className="text-balance text-2xl font-bold">Daily attendance report</h1>
            <p className="text-sm text-muted-foreground">
              {weekday}
              {report.isOffDay ? " · Workshop day off" : ` · Shift ${report.settings.shift_start}–${report.settings.shift_end}`}
            </p>
          </div>
          <nav className="flex items-center gap-2" aria-label="Choose day">
            <Link
              href={`/attendance/report?date=${shiftDate(date, -1)}`}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-muted"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Previous day</span>
            </Link>
            <form action="/attendance/report" className="flex items-center gap-2">
              <label htmlFor="report-date" className="sr-only">
                Date
              </label>
              <input
                id="report-date"
                type="date"
                name="date"
                defaultValue={date}
                max={today}
                className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
              />
              <button type="submit" className="h-9 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">
                Go
              </button>
            </form>
            {date < today ? (
              <Link
                href={`/attendance/report?date=${shiftDate(date, 1)}`}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-muted"
              >
                <ChevronRight className="h-4 w-4" />
                <span className="sr-only">Next day</span>
              </Link>
            ) : null}
          </nav>
        </header>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Summary">
          {stats.map((s) => (
            <Card key={s.label} className="flex flex-col gap-1 p-4">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</span>
              <span className="text-2xl font-bold tabular-nums">{s.value}</span>
              <span className="text-xs text-muted-foreground">{s.sub}</span>
            </Card>
          ))}
        </section>

        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Check in</th>
                <th className="px-4 py-3 font-medium">Check out</th>
                <th className="px-4 py-3 text-right font-medium">Worked</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No staff tracked on this day.
                  </td>
                </tr>
              ) : (
                report.rows.map((r) => (
                  <tr key={r.userId} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{roleLabel(r.role)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium", STATUS[r.status].cls)}>
                        {STATUS[r.status].label}
                        {r.lateMinutes ? ` · ${r.lateMinutes} min` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{formatTime(r.checkInAt)}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {r.missingCheckout ? (
                        <span className={date < today ? "text-destructive" : "text-muted-foreground"}>
                          {date < today ? "Missing" : "On shift"}
                        </span>
                      ) : (
                        formatTime(r.checkOutAt)
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.workedMinutes ? formatDuration(r.workedMinutes) : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </AppShell>
  )
}
