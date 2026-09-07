"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { createVehicleInline, findVehicleByVinOrPlate } from "@/lib/actions-customers"
import { Button, Card, Input, Label, Select } from "@/components/ui"
import { BrandLogo, VehicleVisual } from "@/components/vehicle-visual"
import { UAEPlate } from "@/components/ui"
import { BODY_TYPES, inferBodyType } from "@/lib/vehicle"
import { catalogBodyType } from "@/lib/vehicle-catalog"
import { VehiclePicker, EMPTY_VEHICLE_DRAFT, type VehicleDraft } from "@/components/vehicle-picker"
import { UAE_EMIRATES } from "@/lib/constants"
import { Car, Loader2 } from "lucide-react"

export function VehicleCreateForm({ customerId }: { customerId: string }) {
  const router = useRouter()
  const [draft, setDraft] = React.useState<VehicleDraft>(EMPTY_VEHICLE_DRAFT)
  const patchDraft = (p: Partial<VehicleDraft>) => setDraft((d) => ({ ...d, ...p }))
  const { make, model, variant, color, bodyType } = draft
  const [plateEmirate, setPlateEmirate] = React.useState("Dubai")
  const [plateCode, setPlateCode] = React.useState("")
  const [plateNumber, setPlateNumber] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [dupe, setDupe] = React.useState<{ id: string; make: string | null; model: string | null } | null>(null)

  const effectiveBody = bodyType || catalogBodyType(make, model) || inferBodyType(make, model)

  async function onCreate(fd: FormData) {
    setError(null)
    setDupe(null)
    const vin = String(fd.get("vin") || "").trim()
    setCreating(true)
    try {
      const existing = await findVehicleByVinOrPlate({
        vin,
        plate_emirate: plateEmirate,
        plate_code: plateCode,
        plate_number: plateNumber,
      })
      if (existing) {
        setDupe(existing as any)
        setCreating(false)
        return
      }
      const res = await createVehicleInline({
        customer_id: customerId,
        make,
        model,
        variant,
        year: fd.get("vehicle_year") ? Number(fd.get("vehicle_year")) : null,
        color,
        body_type: bodyType || null,
        plate_emirate: plateEmirate,
        plate_code: plateCode,
        plate_number: plateNumber,
        vin,
        mileage: fd.get("mileage") ? Number(fd.get("mileage")) : null,
      })
      if (!res.ok) {
        setError(res.error)
        setCreating(false)
        return
      }
      router.push(`/vehicles/${res.vehicle.id}`)
    } catch (e: any) {
      setError(e.message ?? "Failed to create vehicle")
      setCreating(false)
    }
  }

  return (
    <form action={onCreate} className="space-y-5">
      <Card className="p-5 space-y-5">
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-background/40 p-3">
          <VehicleVisual make={make} model={model} bodyType={effectiveBody} color={color} className="h-20 w-32 rounded-md" />
          <div className="text-sm">
            <div className="font-medium text-foreground">
              {[make || "Make", model || "Model", variant].filter(Boolean).join(" ")}
            </div>
            <div className="text-xs text-muted-foreground">
              {color ? `${color} · ` : ""}
              {BODY_TYPES.find((b) => b.value === effectiveBody)?.label ?? "Sedan"}
              {!bodyType && " (detected)"}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <BrandLogo make={make} size={40} />
            <UAEPlate emirate={plateEmirate} code={plateCode} number={plateNumber} className="h-11 text-base" />
          </div>
        </div>

        <VehiclePicker value={draft} onChange={patchDraft} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label htmlFor="vin">VIN / Chassis</Label>
            <Input id="vin" name="vin" placeholder="17-digit VIN" />
          </div>
          <div>
            <Label htmlFor="mileage">Mileage / km</Label>
            <Input id="mileage" name="mileage" type="number" min="0" max="2000000" placeholder="e.g. 84000" />
          </div>
        </div>

        <div>
          <Label>Number plate (UAE)</Label>
          <div className="grid gap-3 sm:grid-cols-3">
            <Select value={plateEmirate} onChange={(e) => setPlateEmirate(e.target.value)} aria-label="Emirate">
              {UAE_EMIRATES.map((em) => (
                <option key={em.value} value={em.value}>
                  {em.label}
                </option>
              ))}
            </Select>
            <Input placeholder="Code — e.g. A" value={plateCode} onChange={(e) => setPlateCode(e.target.value.toUpperCase())} aria-label="Plate code" />
            <Input placeholder="Number — e.g. 12345" value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} inputMode="numeric" aria-label="Plate number" />
          </div>
        </div>

        {dupe ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium text-foreground">This vehicle already exists.</p>
            <p className="text-muted-foreground">{[dupe.make, dupe.model].filter(Boolean).join(" ")}</p>
            <button type="button" onClick={() => router.push(`/vehicles/${dupe.id}`)} className="mt-2 font-medium text-primary hover:underline">
              Open existing vehicle →
            </button>
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push(`/customers/${customerId}`)}>
            Cancel
          </Button>
          <Button type="submit" disabled={creating}>
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Car className="h-4 w-4" /> Save Vehicle
              </>
            )}
          </Button>
        </div>
      </Card>
    </form>
  )
}
