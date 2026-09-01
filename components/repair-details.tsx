"use client"

import * as React from "react"
import { updateJobDetails } from "@/lib/actions"
import { Button, Card, Input, Label, Select, AutoTextarea } from "@/components/ui"
import { QC_STATUSES } from "@/lib/constants"
import { Save, Stethoscope } from "lucide-react"

type Job = {
  id: string
  diagnosis: string | null
  repair_instructions: string | null
  technician_notes: string | null
  qc_status: string | null
  estimated_completion: string | null
}

export function RepairDetails({ job }: { job: Job }) {
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <Stethoscope className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Diagnosis &amp; repair details
        </h2>
      </div>

      <form
        action={async (fd) => {
          setSaving(true)
          setSaved(false)
          try {
            await updateJobDetails(job.id, fd)
            setSaved(true)
          } finally {
            setSaving(false)
          }
        }}
        className="space-y-4"
      >
        <div>
          <Label htmlFor="diagnosis">Diagnosis</Label>
          <AutoTextarea
            id="diagnosis"
            name="diagnosis"
            minRows={4}
            defaultValue={job.diagnosis ?? ""}
            placeholder="Technician findings: root cause, measurements, fault codes…"
          />
        </div>

        <div>
          <Label htmlFor="repair_instructions">Repair instructions</Label>
          <AutoTextarea
            id="repair_instructions"
            name="repair_instructions"
            minRows={4}
            defaultValue={job.repair_instructions ?? ""}
            placeholder="Step-by-step repair procedure, torque specs, special tools, warranty steps…"
          />
        </div>

        <div>
          <Label htmlFor="technician_notes">Technician notes</Label>
          <AutoTextarea
            id="technician_notes"
            name="technician_notes"
            minRows={3}
            defaultValue={job.technician_notes ?? ""}
            placeholder="Additional notes, observations, parts required, follow-ups…"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="qc_status">QC status</Label>
            <Select id="qc_status" name="qc_status" defaultValue={job.qc_status ?? "pending"}>
              {QC_STATUSES.map((q) => (
                <option key={q.value} value={q.value}>
                  {q.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="estimated_completion">Estimated completion</Label>
            <Input
              id="estimated_completion"
              name="estimated_completion"
              type="date"
              defaultValue={job.estimated_completion ?? ""}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save repair details"}
          </Button>
          {saved && <span className="text-xs text-emerald-400">Saved</span>}
        </div>
      </form>
    </Card>
  )
}
