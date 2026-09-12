"use client"

import { useState, useMemo, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button, Input, Label, Select, Combo } from "@/components/ui"
import { Modal } from "@/components/modal"
import { updateJobDetails } from "@/lib/actions"
import { identifyVehicle } from "@/lib/actions-vehicle-id"
import { UAE_EMIRATES, COMMON_COLORS } from "@/lib/constants"
import { BODY_TYPES, inferBodyType, MODEL_SUGGESTIONS } from "@/lib/vehicle"
import {
  catalogMakeNames,
  modelsForYear,
  variantsForModelYear,
  catalogBodyType,
  yearOptions,
} from "@/lib/vehicle-catalog"
import { Pencil, Sparkles } from "lucide-react"

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
 * blank with no way to fill them in. Uses the same catalog-backed comboboxes as
 * the intake VehiclePicker so make/model/variant/colour can be *chosen* from a
 * list (year-aware), while still allowing free text for anything not catalogued.
 * Writes straight to the job row via updateJobDetails (guarded by
 * jobs.update_status).
 */
export function EditJobVehicle({ job }: { job: JobVehicle }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Controlled so the model/variant option lists react to make + year.
  const [make, setMake] = useState(job.vehicle_make ?? "")
  const [model, setModel] = useState(job.vehicle_model ?? "")
  const [variant, setVariant] = useState(job.variant ?? "")
  const [year, setYear] = useState(job.vehicle_year ? String(job.vehicle_year) : "")
  const [color, setColor] = useState(job.color ?? "")
  const [bodyType, setBodyType] = useState(job.body_type ?? "")
  const [vin, setVin] = useState(job.vin ?? "")

  // Intelligent identify (VIN decode + AI) state, separate from the save transition.
  const [idNote, setIdNote] = useState<string | null>(null)
  const [identifying, startId] = useTransition()

  const yearNum = year ? Number(year) : null

  const makeOptions = useMemo(() => catalogMakeNames(), [])
  const modelOptions = useMemo(() => {
    const catalog = modelsForYear(make, yearNum)
    return catalog.length ? catalog : MODEL_SUGGESTIONS[make] ?? []
  }, [make, yearNum])
  const variantOptions = useMemo(
    () => variantsForModelYear(make, model, yearNum),
    [make, model, yearNum],
  )
  const years = useMemo(() => yearOptions(make, model), [make, model])
  const detectedBody = catalogBodyType(make, model) ?? inferBodyType(make, model)
  const effectiveBody = bodyType || detectedBody || ""

  function reset() {
    setMake(job.vehicle_make ?? "")
    setModel(job.vehicle_model ?? "")
    setVariant(job.variant ?? "")
    setYear(job.vehicle_year ? String(job.vehicle_year) : "")
    setColor(job.color ?? "")
    setBodyType(job.body_type ?? "")
    setVin(job.vin ?? "")
    setError(null)
    setIdNote(null)
  }

  function close() {
    setOpen(false)
    reset()
  }

  // Run the hybrid VIN decode + AI identification and apply the suggestions to
  // the form. Uses any make/model already typed as extra context, so it still
  // helps when the chassis number is non-standard and can't be decoded.
  function autofill() {
    setIdNote(null)
    setError(null)
    const q = [make, model, variant].filter(Boolean).join(" ").trim()
    const trimmedVin = vin.trim()
    if (!trimmedVin && !q) {
      setIdNote("Enter a chassis / VIN, or a make and model, then try again.")
      return
    }
    startId(async () => {
      try {
        const res = await identifyVehicle({
          vin: trimmedVin || undefined,
          query: q || trimmedVin || undefined,
        })
        if (!res.ok) {
          setIdNote(res.error)
          return
        }
        const d = res.data
        if (d.make?.value) setMake(d.make.value)
        if (d.model?.value) setModel(d.model.value)
        if (d.year?.value) setYear(d.year.value)
        if (d.variant?.value) setVariant(d.variant.value)
        if (d.bodyType?.value) setBodyType(d.bodyType.value)
        setIdNote(
          d.reviewRequired
            ? (d.note ?? "Filled in from the chassis — please review before saving.")
            : "Filled in from the chassis. Review the fields and save.",
        )
      } catch (e: any) {
        setIdNote(e?.message ?? "Couldn't identify the vehicle. Enter details manually.")
      }
    })
  }

  function onSave(fd: FormData) {
    // Ensure the derived body type is submitted even if the field was left on
    // the auto-detected placeholder.
    if (!fd.get("body_type") && effectiveBody) fd.set("body_type", effectiveBody)
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

      <Modal open={open} onClose={close} title="Edit vehicle details">
        <form action={onSave} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Choose the make and model from the list, or type your own when the chassis / VIN could
            not be identified automatically.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vehicle_make">Make</Label>
              <Combo
                id="vehicle_make"
                name="vehicle_make"
                placeholder="e.g. Mercedes-Benz"
                options={makeOptions}
                value={make}
                onChange={(e) => {
                  // Changing the make invalidates the previously chosen model/variant.
                  setMake(e.target.value)
                  setModel("")
                  setVariant("")
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vehicle_year">Year</Label>
              <Combo
                id="vehicle_year"
                name="vehicle_year"
                type="number"
                inputMode="numeric"
                min="1950"
                max="2100"
                placeholder="e.g. 2021"
                options={years.map(String)}
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vehicle_model">Model</Label>
              <Combo
                id="vehicle_model"
                name="vehicle_model"
                placeholder={make ? "Select or type a model" : "Pick a make first"}
                options={modelOptions}
                value={model}
                onChange={(e) => {
                  setModel(e.target.value)
                  setVariant("")
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="variant">Variant</Label>
              <Combo
                id="variant"
                name="variant"
                placeholder={variantOptions.length ? "Select or type a trim" : "e.g. GXR, AMG, Sport"}
                options={
                  variantOptions.length
                    ? variantOptions
                    : ["AMG", "GT", "GTS", "Sport", "M Sport", "S-Line", "Limited", "Platinum"]
                }
                value={variant}
                onChange={(e) => setVariant(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="color">Colour</Label>
              <Combo
                id="color"
                name="color"
                placeholder="e.g. Pearl White"
                options={COMMON_COLORS}
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="body_type">Body type</Label>
              <Select
                id="body_type"
                name="body_type"
                value={effectiveBody}
                onChange={(e) => setBodyType(e.target.value)}
              >
                <option value="">{detectedBody ? `Auto: ${detectedBody}` : "—"}</option>
                {BODY_TYPES.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vin">VIN / Chassis</Label>
              <div className="flex gap-2">
                <Input
                  id="vin"
                  name="vin"
                  value={vin}
                  onChange={(e) => setVin(e.target.value)}
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={autofill}
                  disabled={identifying}
                  className="shrink-0 gap-1.5 whitespace-nowrap"
                  title="Identify make, model and year from the chassis / VIN"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {identifying ? "Identifying…" : "Auto-fill"}
                </Button>
              </div>
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

          {idNote ? <p className="text-sm text-muted-foreground">{idNote}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>
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
