"use client"

import * as React from "react"
import { assignStaff, addJobTechnician, removeJobTechnician } from "@/lib/actions"
import { Button, Card, Label, Select } from "@/components/ui"
import { roleLabel } from "@/lib/rbac/roles"
import { TRADES, tradeFromTitle, tradeLabel, type Trade } from "@/lib/trades"
import { Loader2, Plus, X, Star } from "lucide-react"

type Staff = {
  id: string
  full_name: string | null
  role: string
  job_title?: string | null
  skills?: string[]
  active_jobs?: number
}

export type JobTech = { user_id: string; trade: Trade }

function optionLabel(s: Staff): string {
  const title = s.job_title?.trim() || roleLabel(s.role)
  const busy = s.active_jobs ? ` · ${s.active_jobs} active` : ""
  return `${s.full_name || "Staff"} — ${title}${busy}`
}

export function StaffAssign({
  jobId,
  staff,
  advisorId,
  technicianId,
  technicians,
  canAssign = true,
}: {
  jobId: string
  staff: Staff[]
  advisorId: string | null
  technicianId: string | null
  technicians: JobTech[]
  canAssign?: boolean
}) {
  const [pick, setPick] = React.useState("")
  const [trade, setTrade] = React.useState<Trade>("mechanic")
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const byId = new Map(staff.map((s) => [s.id, s]))
  const onTeam = new Set(technicians.map((t) => t.user_id))
  const available = staff.filter((s) => !onTeam.has(s.id))
  const advisor = advisorId ? byId.get(advisorId) : null

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Job team</h2>
      <div className="flex flex-col gap-5">
        <div>
          <Label>Service advisor</Label>
          {canAssign ? (
            <Select defaultValue={advisorId ?? ""} onChange={(e) => assignStaff(jobId, "advisor_id", e.target.value)}>
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {optionLabel(s)}
                </option>
              ))}
            </Select>
          ) : (
            <p className="text-sm text-foreground">{advisor?.full_name || "Unassigned"}</p>
          )}
        </div>

        <div>
          <Label>Technicians ({technicians.length})</Label>
          {technicians.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-3 text-center text-xs text-muted-foreground">
              No technicians on this car yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {technicians.map((t) => {
                const s = byId.get(t.user_id)
                const lead = t.user_id === technicianId
                return (
                  <li
                    key={t.user_id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/40 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                        {s?.full_name || "Staff"}
                        {lead && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase text-primary">
                            <Star className="h-3 w-3 fill-current" /> Lead
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{tradeLabel(t.trade)}</div>
                    </div>
                    {canAssign && (
                      <button
                        type="button"
                        onClick={() => run(t.user_id, () => removeJobTechnician(jobId, t.user_id))}
                        disabled={busy !== null}
                        aria-label={`Remove ${s?.full_name || "technician"}`}
                        className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        {busy === t.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {canAssign && available.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
              <Select
                aria-label="Technician to add"
                value={pick}
                onChange={(e) => {
                  setPick(e.target.value)
                  const s = byId.get(e.target.value)
                  if (s) setTrade(tradeFromTitle(s.job_title))
                }}
              >
                <option value="">Add a technician…</option>
                {available.map((s) => (
                  <option key={s.id} value={s.id}>
                    {optionLabel(s)}
                  </option>
                ))}
              </Select>
              <div className="flex gap-2">
                <Select
                  aria-label="Trade"
                  value={trade}
                  onChange={(e) => setTrade(e.target.value as Trade)}
                  className="flex-1"
                >
                  {TRADES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  disabled={!pick || busy !== null}
                  onClick={() =>
                    run("add", async () => {
                      await addJobTechnician(jobId, pick, trade)
                      setPick("")
                    })
                  }
                >
                  {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
                </Button>
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}
