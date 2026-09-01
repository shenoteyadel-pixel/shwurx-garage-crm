"use client"

import * as React from "react"
import { createJob } from "@/lib/actions"
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui"
import { PhotoUploader } from "@/components/photo-uploader"

type Staff = { id: string; full_name: string | null; role: string }

export function NewJobForm({ staff }: { staff: Staff[] }) {
  const [vehiclePhotos, setVehiclePhotos] = React.useState<string[]>([])
  const [damagePhotos, setDamagePhotos] = React.useState<string[]>([])
  const [submitting, setSubmitting] = React.useState(false)

  return (
    <form
      action={async (fd) => {
        setSubmitting(true)
        fd.set("photo_urls", vehiclePhotos.join(","))
        fd.set("damage_urls", damagePhotos.join(","))
        try {
          await createJob(fd)
        } finally {
          setSubmitting(false)
        }
      }}
      className="space-y-6"
    >
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Customer</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="customer_name">Customer name</Label>
            <Input id="customer_name" name="customer_name" required placeholder="e.g. Ahmed Al Mansoori" />
          </div>
          <div>
            <Label htmlFor="customer_mobile">Mobile number</Label>
            <Input
              id="customer_mobile"
              name="customer_mobile"
              required
              placeholder="e.g. +971 50 123 4567"
              inputMode="tel"
            />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Vehicle</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label htmlFor="vehicle_make">Make</Label>
            <Input id="vehicle_make" name="vehicle_make" placeholder="e.g. Toyota" />
          </div>
          <div>
            <Label htmlFor="vehicle_model">Model</Label>
            <Input id="vehicle_model" name="vehicle_model" placeholder="e.g. Land Cruiser" />
          </div>
          <div>
            <Label htmlFor="vehicle_year">Year</Label>
            <Input id="vehicle_year" name="vehicle_year" type="number" min="1950" max="2100" placeholder="2021" />
          </div>
          <div>
            <Label htmlFor="plate_number">Plate number</Label>
            <Input id="plate_number" name="plate_number" placeholder="e.g. Dubai A 12345" />
          </div>
          <div>
            <Label htmlFor="vin">VIN</Label>
            <Input id="vin" name="vin" placeholder="17-digit VIN" />
          </div>
          <div>
            <Label htmlFor="mileage">Mileage / km</Label>
            <Input id="mileage" name="mileage" type="number" min="0" placeholder="e.g. 84000" />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Assignment</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="advisor_id">Service advisor</Label>
            <Select id="advisor_id" name="advisor_id" defaultValue="">
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name || "Staff"} ({s.role})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="technician_id">Technician</Label>
            <Select id="technician_id" name="technician_id" defaultValue="">
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name || "Staff"} ({s.role})
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="mt-4">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" placeholder="Customer complaint, requested work, etc." />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Vehicle photos</h2>
        <PhotoUploader value={vehiclePhotos} onChange={setVehiclePhotos} label="Exterior / interior" />
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Damage / inspection photos
        </h2>
        <PhotoUploader value={damagePhotos} onChange={setDamagePhotos} label="Damage areas" accentDamage />
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? "Creating..." : "Create Job Card"}
        </Button>
      </div>
    </form>
  )
}
