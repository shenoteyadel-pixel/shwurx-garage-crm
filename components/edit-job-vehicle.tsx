"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button, Input, Label, Select } from "@/components/ui"
import { Modal } from "@/components/modal"
import { updateJobDetails } from "@/lib/actions"
import { UAE_EMIRATES } from "@/lib/constants"
import { Pencil } from "lucide-react"

type JobVehicle = {
  id: string
  vehicle_make: string | null
  vehicle_model: string | null
  variant: string | null
  vehicle_year: number | null
  color: string | null
  body_type: string | null
  vin: string | null
  mileage: number | null
  plate_emirate: string | null
  plate_code: string | null
  plate_number: string | null
}

/**
 * Manual vehicle-detail editor for the job card. Needed because a VIN/chassis
 * added at check-in may not resolve through AI decode, leaving make/model/year
 * blank with no way to fill them in. Writes straight to the job row via
 * updateJobDetails (guarded by jobs.update_status).
 */
export function EditJobVehicle({ job }: { job: JobVehicle }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSave(fd: FormData) {
    setError(null)
    start(async () => {
      try {
        await updateJobDetails(job.id, fd)
        setOpen(false)
        router.refresh()
      } catch (e: any) {
        setError(e?.message ?? "Failed to save")
      }
    })
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-7 gap-1.5 px-2 text-xs"
      >
        <Pencil className="h-3.5 w-3.5" /> Edit
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Edit vehicle details">
        <form action={onSave} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Fill these in manually when the chassis / VIN could not be identified automatically.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vehicle_make">Make</Label>
              <Input id="vehicle_make" name="vehicle_make" defaultValue={job.vehicle_make ?? ""} placeholder="e.g. Toyota" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vehicle_model">Model</Label>
              <Input id="vehicle_model" name="vehicle_model" defaultValue={job.vehicle_model ?? ""} placeholder="e.g. Land Cruiser" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="variant">Variant</Label>
              <Input id="variant" name="variant" defaultValue={job.variant ?? ""} placeholder="e.g. GXR" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vehicle_year">Year</Label>
              <Input id="vehicle_year" name="vehicle_year" type="number" min="1950" max="2100" defaultValue={job.vehicle_year ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="color">Colour</Label>
              <Input id="color" name="color" defaultValue={job.color ?? ""} placeholder="e.g. White" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="body_type">Body type</Label>
              <Input id="body_type" name="body_type" defaultValue={job.body_type ?? ""} placeholder="e.g. SUV" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vin">VIN / Chassis</Label>
              <Input id="vin" name="vin" defaultValue={job.vin ?? ""} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mileage">Mileage (km)</Label>
              <Input id="mileage" name="mileage" type="number" min="0" max="2000000" defaultValue={job.mileage ?? ""} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="plate_emirate">Emirate</Label>
              <Select id="plate_emirate" name="plate_emirate" defaultValue={job.plate_emirate ?? ""}>
                <option value="">—</option>
                {UAE_EMIRATES.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plate_code">Code</Label>
              <Input id="plate_code" name="plate_code" defaultValue={job.plate_code ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plate_number">Plate no.</Label>
              <Input id="plate_number" name="plate_number" defaultValue={job.plate_number ?? ""} />
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
