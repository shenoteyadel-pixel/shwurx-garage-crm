"use client"

import { assignStaff } from "@/lib/actions"
import { Card, Label, Select } from "@/components/ui"

type Staff = { id: string; full_name: string | null; role: string }

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
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Assignment</h2>
      <div className="space-y-4">
        <div>
          <Label>Service advisor</Label>
          <Select
            defaultValue={advisorId ?? ""}
            onChange={(e) => assignStaff(jobId, "advisor_id", e.target.value)}
          >
            <option value="">Unassigned</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name || "Staff"} ({s.role})
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
                {s.full_name || "Staff"} ({s.role})
              </option>
            ))}
          </Select>
        </div>
      </div>
    </Card>
  )
}
