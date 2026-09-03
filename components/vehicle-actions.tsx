"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, Button, Input, Label, Select } from "@/components/ui"
import { Modal } from "@/components/modal"
import { updateVehicle, transferVehicleOwner } from "@/lib/actions-customers"
import { UAE_EMIRATES } from "@/lib/constants"
import { Pencil, ArrowLeftRight } from "lucide-react"

type Vehicle = {
  id: string
  make: string | null
  model: string | null
  variant: string | null
  year: number | null
  color: string | null
  body_type: string | null
  plate_emirate: string | null
  plate_code: string | null
  plate_number: string | null
  vin: string | null
  engine_number: string | null
  mileage: number | null
  notes: string | null
}

export function VehicleActions({
  vehicle,
  customers,
  currentOwnerId,
}: {
  vehicle: Vehicle
  customers: { id: string; full_name: string; mobile: string | null }[]
  currentOwnerId: string | null
}) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function onEdit(fd: FormData) {
    setError(null)
    start(async () => {
      try {
        const res = await updateVehicle(vehicle.id, fd)
        setEditOpen(false)
        if (res?.identityChanged) {
          setNotice("Vehicle information changed — re-resolving the reference photo.")
          setTimeout(() => setNotice(null), 4000)
        }
        router.refresh()
      } catch (e: any) {
        setError(e.message ?? "Failed to save")
      }
    })
  }

  function onTransfer(fd: FormData) {
    setError(null)
    const newOwner = String(fd.get("customer_id") || "")
    if (!newOwner) {
      setError("Select the new owner")
      return
    }
    start(async () => {
      try {
        await transferVehicleOwner(vehicle.id, newOwner)
        setTransferOpen(false)
        router.refresh()
      } catch (e: any) {
        setError(e.message ?? "Failed to transfer")
      }
    })
  }

  return (
    <>
      <Card className="p-4">
        {notice ? (
          <p className="mb-3 rounded-md border border-primary/30 bg-primary/10 p-2 text-xs font-medium text-primary">
            {notice}
          </p>
        ) : null}
        <div className="flex flex-col gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="justify-start">
            <Pencil className="h-4 w-4" /> Edit vehicle
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTransferOpen(true)} className="justify-start">
            <ArrowLeftRight className="h-4 w-4" /> Transfer owner
          </Button>
        </div>
      </Card>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit vehicle">
        <form action={onEdit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="make">Make</Label>
              <Input id="make" name="make" defaultValue={vehicle.make ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model">Model</Label>
              <Input id="model" name="model" defaultValue={vehicle.model ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="variant">Variant</Label>
              <Input id="variant" name="variant" defaultValue={vehicle.variant ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="year">Year</Label>
              <Input id="year" name="year" type="number" defaultValue={vehicle.year ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="color">Colour</Label>
              <Input id="color" name="color" defaultValue={vehicle.color ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="body_type">Body type</Label>
              <Input id="body_type" name="body_type" defaultValue={vehicle.body_type ?? ""} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="plate_emirate">Emirate</Label>
              <Select id="plate_emirate" name="plate_emirate" defaultValue={vehicle.plate_emirate ?? ""}>
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
              <Input id="plate_code" name="plate_code" defaultValue={vehicle.plate_code ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plate_number">Plate no.</Label>
              <Input id="plate_number" name="plate_number" defaultValue={vehicle.plate_number ?? ""} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vin">VIN / Chassis</Label>
              <Input id="vin" name="vin" defaultValue={vehicle.vin ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="engine_number">Engine no.</Label>
              <Input id="engine_number" name="engine_number" defaultValue={vehicle.engine_number ?? ""} />
            </div>
            <div className="space-y-1.5">
            <Label htmlFor="mileage">Mileage (km)</Label>
            <Input id="mileage" name="mileage" type="number" min="0" max="2000000" defaultValue={vehicle.mileage ?? ""} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" name="notes" defaultValue={vehicle.notes ?? ""} />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={transferOpen} onClose={() => setTransferOpen(false)} title="Transfer ownership">
        <form action={onTransfer} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Move this vehicle to another customer. Past job cards and invoices stay with their original visit; only
            future ownership changes.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="customer_id">New owner</Label>
            <Select id="customer_id" name="customer_id" defaultValue="">
              <option value="" disabled>
                Select customer…
              </option>
              {customers
                .filter((c) => c.id !== currentOwnerId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                    {c.mobile ? ` — ${c.mobile}` : ""}
                  </option>
                ))}
            </Select>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setTransferOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Transferring…" : "Transfer"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
