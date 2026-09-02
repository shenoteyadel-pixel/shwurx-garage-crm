"use client"

import { assignStaff } from "@/lib/actions"
import { Card, Label, Select } from "@/components/ui"
import { roleLabel } from "@/lib/rbac/roles"

type Staff = {
  id: string
  full_name: string | null
  role: string
  job_title?: string | null
  skills?: string[]
  active_jobs?: number
}

/** Build a rich option label: name — job title/role · Nx active. */
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
}: {
  jobId: string
  staff: Staff[]
  advisorId: string | null
  technicianId: string | null
}) {
  const technician = staff.find((s) => s.id === technicianId)

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Assignment</h2>
      <div className="space-y-4">
        <div>
          <Label>Service advisor</Label>
          <Select defaultValue={advisorId ?? ""} onChange={(e) => assignStaff(jobId, "advisor_id", e.target.value)}>
            <option value="">Unassigned</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {optionLabel(s)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Technician</Label>
          <Select
            defaultValue={technicianId ?? ""}
            onChange={(e) => assignStaff(jobId, "technician_id", e.target.value)}
          >
            <option value="">Unassigned</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {optionLabel(s)}
              </option>
            ))}
          </Select>

          {/* Show the assigned technician's specializations to confirm a good match. */}
          {technician && technician.skills && technician.skills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              <span className="text-xs text-muted-foreground">Specializes in:</span>
              {technician.skills.slice(0, 5).map((skill) => (
                <span key={skill} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  {skill}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
