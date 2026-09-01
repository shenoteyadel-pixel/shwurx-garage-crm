"use client"

import * as React from "react"
import { createJob } from "@/lib/actions"
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui"
import { PhotoUploader } from "@/components/photo-uploader"
import { BrandLogo, VehicleVisual } from "@/components/vehicle-visual"
import { BODY_TYPES, inferBodyType } from "@/lib/vehicle"

type Staff = { id: string; full_name: string | null; role: string }

export function NewJobForm({ staff }: { staff: Staff[] }) {
  const [vehiclePhotos, setVehiclePhotos] = React.useState<string[]>([])
  const [damagePhotos, setDamagePhotos] = React.useState<string[]>([])
  const [submitting, setSubmitting] = React.useState(false)

  const [make, setMake] = React.useState("")
  const [model, setModel] = React.useState("")
  const [bodyType, setBodyType] = React.useState("") // "" = auto

  const effectiveBody = bodyType || inferBodyType(make, model)

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
        <div className="mt-4">
          <Label htmlFor="complaint">Customer complaint</Label>
          <Textarea
            id="complaint"
            name="complaint"
            placeholder="What did the customer report? e.g. Vibration when braking, AC not cooling..."
          />
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Vehicle</h2>
          <BrandLogo make={make} size={44} />
        </div>

        {/* Live vehicle visual preview */}
        <div className="mb-5 flex items-center gap-4 rounded-lg border border-border bg-background/40 p-3">
          <VehicleVisual make={make} model={model} bodyType={effectiveBody} className="h-20 w-32 rounded-md" />
          <div className="text-sm">
            <div className="font-medium text-foreground">
              {make || "Make"} {model || "Model"}
            </div>
            <div className="text-xs text-muted-foreground">
              Auto visual: {BODY_TYPES.find((b) => b.value === effectiveBody)?.label ?? "Sedan"}
              {!bodyType && " (detected)"}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label htmlFor="vehicle_make">Make</Label>
            <Input
              id="vehicle_make"
              name="vehicle_make"
              placeholder="e.g. Toyota"
              value={make}
              onChange={(e) => setMake(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="vehicle_model">Model</Label>
            <Input
              id="vehicle_model"
              name="vehicle_model"
              placeholder="e.g. Land Cruiser"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="variant">Variant</Label>
            <Input id="variant" name="variant" placeholder="e.g. VXR / GT / Sport" />
          </div>
          <div>
            <Label htmlFor="vehicle_year">Year</Label>
            <Input id="vehicle_year" name="vehicle_year" type="number" min="1950" max="2100" placeholder="2021" />
          </div>
          <div>
            <Label htmlFor="color">Color</Label>
            <Input id="color" name="color" placeholder="e.g. Pearl White" />
          </div>
          <div>
            <Label htmlFor="body_type">Body type</Label>
            <Select id="body_type" name="body_type" value={bodyType} onChange={(e) => setBodyType(e.target.value)}>
              <option value="">Auto-detect</option>
              {BODY_TYPES.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </Select>
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
          <Textarea id="notes" name="notes" placeholder="Requested work, internal notes, etc." />
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
