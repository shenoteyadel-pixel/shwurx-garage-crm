"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  createJobFromMaster,
  searchCustomers,
  getCustomerVehicles,
  createCustomerInline,
  createVehicleInline,
  findVehicleByVinOrPlate,
  type JobCreateResult,
} from "@/lib/actions-customers"
import { resendCheckInForJob } from "@/lib/actions-customer-portal"
import { Button, Card, Combo, Input, Label, Select, Textarea, UAEPlate } from "@/components/ui"
import { PhotoUploader } from "@/components/photo-uploader"
import { BrandLogo, VehicleVisual } from "@/components/vehicle-visual"
import { BODY_TYPES, inferBodyType, MODEL_SUGGESTIONS } from "@/lib/vehicle"
import { COMMON_MAKES, COMMON_COLORS, UAE_EMIRATES } from "@/lib/constants"
import {
  Search,
  UserPlus,
  Check,
  ArrowLeft,
  Car,
  Phone,
  Plus,
  Loader2,
  X,
  Copy,
  MessageCircle,
  Mail,
  ExternalLink,
  CircleCheck,
  CircleAlert,
} from "lucide-react"

type Staff = { id: string; full_name: string | null; role: string }
type Customer = {
  id: string
  full_name: string
  mobile: string | null
  email?: string | null
  company_name?: string | null
}
type Vehicle = {
  id: string
  make: string | null
  model: string | null
  variant?: string | null
  year: number | null
  color?: string | null
  plate_emirate?: string | null
  plate_code?: string | null
  plate_number?: string | null
  vin?: string | null
  reference_image_url?: string | null
}

const STEPS = ["Customer", "Vehicle", "Visit details"]

export function NewJobForm({ staff }: { staff: Staff[] }) {
  const [step, setStep] = React.useState(0)
  const [customer, setCustomer] = React.useState<Customer | null>(null)
  const [vehicle, setVehicle] = React.useState<Vehicle | null>(null)

  function goCustomer(c: Customer) {
    setCustomer(c)
    setVehicle(null)
    setStep(1)
  }
  function goVehicle(v: Vehicle) {
    setVehicle(v)
    setStep(2)
  }

  return (
    <div className="space-y-6">
      <Stepper step={step} customer={customer} vehicle={vehicle} onJump={(s) => s < step && setStep(s)} />

      {step === 0 && <CustomerStep onSelect={goCustomer} />}
      {step === 1 && customer && (
        <VehicleStep customer={customer} onBack={() => setStep(0)} onSelect={goVehicle} />
      )}
      {step === 2 && customer && vehicle && (
        <VisitStep customer={customer} vehicle={vehicle} staff={staff} onBack={() => setStep(1)} />
      )}
    </div>
  )
}

/* ---------------- Stepper ---------------- */
function Stepper({
  step,
  customer,
  vehicle,
  onJump,
}: {
  step: number
  customer: Customer | null
  vehicle: Vehicle | null
  onJump: (s: number) => void
}) {
  const summaries = [
    customer?.full_name ?? null,
    vehicle ? [vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle" : null,
    null,
  ]
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((label, i) => {
        const active = i === step
        const done = i < step
        return (
          <React.Fragment key={label}>
            <button
              type="button"
              onClick={() => onJump(i)}
              disabled={i >= step}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : done
                    ? "bg-secondary text-foreground hover:bg-accent"
                    : "text-muted-foreground"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  done ? "bg-primary text-primary-foreground" : active ? "bg-primary-foreground/20" : "bg-muted"
                }`}
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className="hidden sm:inline">{summaries[i] ?? label}</span>
            </button>
            {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
          </React.Fragment>
        )
      })}
    </div>
  )
}

/* ---------------- Step 1: Customer ---------------- */
function CustomerStep({ onSelect }: { onSelect: (c: Customer) => void }) {
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<Customer[]>([])
  const [searching, setSearching] = React.useState(false)
  const [mode, setMode] = React.useState<"search" | "new">("search")
  const [creating, setCreating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const q = query.trim()
    if (mode !== "search" || q.length < 2) {
      setResults([])
      return
    }
    let cancel = false
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const rows = await searchCustomers(q)
        if (!cancel) setResults(rows as Customer[])
      } finally {
        if (!cancel) setSearching(false)
      }
    }, 250)
    return () => {
      cancel = true
      clearTimeout(t)
    }
  }, [query, mode])

  async function onCreate(fd: FormData) {
    setError(null)
    const full_name = String(fd.get("full_name") || "").trim()
    if (!full_name) {
      setError("Customer name is required")
      return
    }
    setCreating(true)
    try {
      const c = await createCustomerInline({
        full_name,
        mobile: String(fd.get("mobile") || ""),
        whatsapp: String(fd.get("whatsapp") || ""),
        email: String(fd.get("email") || ""),
        company_name: String(fd.get("company_name") || ""),
        trn: String(fd.get("trn") || ""),
      })
      onSelect(c as Customer)
    } catch (e: any) {
      setError(e.message ?? "Failed to create customer")
    } finally {
      setCreating(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Who is this for?</h2>
        <div className="flex gap-1 rounded-lg bg-secondary p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("search")}
            className={`rounded-md px-3 py-1 ${mode === "search" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            Existing
          </button>
          <button
            type="button"
            onClick={() => setMode("new")}
            className={`rounded-md px-3 py-1 ${mode === "new" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            New
          </button>
        </div>
      </div>

      {mode === "search" ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or mobile number…"
              className="pl-9"
            />
          </div>

          {searching && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          )}

          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              No customer found.{" "}
              <button type="button" onClick={() => setMode("new")} className="font-medium text-primary hover:underline">
                Create a new customer
              </button>
            </div>
          )}

          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-accent"
              >
                <div>
                  <div className="font-medium">{c.full_name}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    {c.mobile ? (
                      <>
                        <Phone className="h-3 w-3" /> {c.mobile}
                      </>
                    ) : (
                      "No mobile on file"
                    )}
                    {c.company_name ? ` · ${c.company_name}` : ""}
                  </div>
                </div>
                <span className="text-xs text-primary">Select →</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <form action={onCreate} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="full_name">Customer name *</Label>
              <Input id="full_name" name="full_name" autoFocus required placeholder="e.g. Ahmed Al Mansoori" />
            </div>
            <div>
              <Label htmlFor="mobile">Mobile number</Label>
              <Input id="mobile" name="mobile" inputMode="tel" placeholder="e.g. +971 50 123 4567" />
            </div>
            <div>
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <Input id="whatsapp" name="whatsapp" inputMode="tel" placeholder="If different from mobile" />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="name@example.com" />
            </div>
            <div>
              <Label htmlFor="company_name">Company (optional)</Label>
              <Input id="company_name" name="company_name" placeholder="For fleet / corporate" />
            </div>
            <div>
              <Label htmlFor="trn">TRN (optional)</Label>
              <Input id="trn" name="trn" placeholder="Tax registration number" />
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Creating…
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" /> Create & continue
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}

/* ---------------- Step 2: Vehicle ---------------- */
function VehicleStep({
  customer,
  onBack,
  onSelect,
}: {
  customer: Customer
  onBack: () => void
  onSelect: (v: Vehicle) => void
}) {
  const [vehicles, setVehicles] = React.useState<Vehicle[]>([])
  const [loading, setLoading] = React.useState(true)
  const [mode, setMode] = React.useState<"list" | "new">("list")

  React.useEffect(() => {
    let cancel = false
    setLoading(true)
    getCustomerVehicles(customer.id)
      .then((rows) => {
        if (cancel) return
        setVehicles(rows as Vehicle[])
        if ((rows as Vehicle[]).length === 0) setMode("new")
      })
      .finally(() => !cancel && setLoading(false))
    return () => {
      cancel = true
    }
  }, [customer.id])

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Customer
        </button>
        {vehicles.length > 0 && (
          <div className="flex gap-1 rounded-lg bg-secondary p-1 text-sm">
            <button
              type="button"
              onClick={() => setMode("list")}
              className={`rounded-md px-3 py-1 ${mode === "list" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              On file
            </button>
            <button
              type="button"
              onClick={() => setMode("new")}
              className={`rounded-md px-3 py-1 ${mode === "new" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              Add vehicle
            </button>
          </div>
        )}
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        Which vehicle is <span className="font-medium text-foreground">{customer.full_name}</span> bringing in?
      </p>

      {mode === "list" ? (
        loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading vehicles…
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {vehicles.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => onSelect(v)}
                className="flex items-center gap-3 rounded-lg border border-border p-3 text-left hover:border-primary hover:bg-accent"
              >
                <VehicleVisual
                  referenceImage={v.reference_image_url}
                  make={v.make}
                  model={v.model}
                  color={v.color}
                  className="h-14 w-20 shrink-0 rounded-md"
                />
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {[v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[v.plate_emirate, v.plate_code, v.plate_number].filter(Boolean).join(" ") || "No plate"}
                    {v.vin ? ` · ${v.vin}` : ""}
                  </div>
                </div>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setMode("new")}
              className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground hover:border-primary hover:text-foreground"
            >
              <Plus className="h-4 w-4" /> Add another vehicle
            </button>
          </div>
        )
      ) : (
        <NewVehicleForm customerId={customer.id} onCreated={onSelect} onCancel={() => vehicles.length > 0 && setMode("list")} />
      )}
    </Card>
  )
}

function NewVehicleForm({
  customerId,
  onCreated,
  onCancel,
}: {
  customerId: string
  onCreated: (v: Vehicle) => void
  onCancel: () => void
}) {
  const [make, setMake] = React.useState("")
  const [model, setModel] = React.useState("")
  const [variant, setVariant] = React.useState("")
  const [color, setColor] = React.useState("")
  const [bodyType, setBodyType] = React.useState("")
  const [plateEmirate, setPlateEmirate] = React.useState("Dubai")
  const [plateCode, setPlateCode] = React.useState("")
  const [plateNumber, setPlateNumber] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [dupe, setDupe] = React.useState<Vehicle | null>(null)

  const effectiveBody = bodyType || inferBodyType(make, model)

  async function onCreate(fd: FormData) {
    setError(null)
    setDupe(null)
    const vin = String(fd.get("vin") || "").trim()
    setCreating(true)
    try {
      // Dedupe check by VIN / plate before creating.
      const existing = await findVehicleByVinOrPlate({
        vin,
        plate_emirate: plateEmirate,
        plate_code: plateCode,
        plate_number: plateNumber,
      })
      if (existing) {
        setDupe(existing as Vehicle)
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
      onCreated(res.vehicle as Vehicle)
    } catch (e: any) {
      setError(e.message ?? "Failed to create vehicle")
      setCreating(false)
    }
  }

  return (
    <form action={onCreate} className="space-y-5">
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label htmlFor="vehicle_make">Make</Label>
          <Combo id="vehicle_make" name="vehicle_make" placeholder="e.g. Toyota" options={COMMON_MAKES} value={make} onChange={(e) => setMake(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="vehicle_model">Model</Label>
          <Combo id="vehicle_model" name="vehicle_model" placeholder="e.g. Land Cruiser" options={MODEL_SUGGESTIONS[make] ?? []} value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="variant">Variant / trim</Label>
          <Combo id="variant" name="variant" placeholder="e.g. VXR / GT" options={["VXR", "GXR", "GT", "GTS", "Sport", "AMG", "M Sport", "S-Line", "Limited", "Platinum"]} value={variant} onChange={(e) => setVariant(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="vehicle_year">Year</Label>
          <Input id="vehicle_year" name="vehicle_year" type="number" min="1950" max="2100" placeholder="2021" />
        </div>
        <div>
          <Label htmlFor="color">Color</Label>
          <Combo id="color" name="color" placeholder="e.g. Pearl White" options={COMMON_COLORS} value={color} onChange={(e) => setColor(e.target.value)} />
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
          <Label htmlFor="vin">VIN / Chassis</Label>
          <Input id="vin" name="vin" placeholder="17-digit VIN" />
        </div>
        <div>
          <Label htmlFor="mileage">Mileage / km</Label>
          <Input id="mileage" name="mileage" type="number" min="0" placeholder="e.g. 84000" />
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
          <p className="font-medium text-foreground">This vehicle already exists on file.</p>
          <p className="text-muted-foreground">
            {[dupe.year, dupe.make, dupe.model].filter(Boolean).join(" ")} —{" "}
            {[dupe.plate_emirate, dupe.plate_code, dupe.plate_number].filter(Boolean).join(" ")}
          </p>
          <button type="button" onClick={() => onCreated(dupe)} className="mt-2 font-medium text-primary hover:underline">
            Use this vehicle →
          </button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={creating}>
          {creating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Car className="h-4 w-4" /> Save & continue
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

/* ---------------- Step 3: Visit details ---------------- */
function VisitStep({
  customer,
  vehicle,
  staff,
  onBack,
}: {
  customer: Customer
  vehicle: Vehicle
  staff: Staff[]
  onBack: () => void
}) {
  const [vehiclePhotos, setVehiclePhotos] = React.useState<string[]>([])
  const [damagePhotos, setDamagePhotos] = React.useState<string[]>([])
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<Extract<JobCreateResult, { ok: true }> | null>(null)

  return (
    <form
      action={async (fd) => {
        setSubmitting(true)
        setError(null)
        fd.set("customer_id", customer.id)
        fd.set("vehicle_id", vehicle.id)
        fd.set("photo_urls", vehiclePhotos.join(","))
        fd.set("damage_urls", damagePhotos.join(","))
        try {
          const res = await createJobFromMaster(fd)
          if (!res.ok) {
            setError(res.error)
            return
          }
          setResult(res)
        } catch (e: any) {
          setError(e?.message ?? "Could not create the job card. Please try again.")
        } finally {
          setSubmitting(false)
        }
      }}
      className="space-y-6"
    >
      {result && (
        <JobSuccessDialog
          result={result}
          customerEmail={customer.email ?? null}
          customerMobile={customer.mobile ?? null}
        />
      )}
      <Card className="p-5">
        <button type="button" onClick={onBack} className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Vehicle
        </button>
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-background/40 p-3">
          <VehicleVisual
            referenceImage={vehicle.reference_image_url}
            make={vehicle.make}
            model={vehicle.model}
            color={vehicle.color}
            className="h-16 w-24 shrink-0 rounded-md"
          />
          <div className="text-sm">
            <div className="font-medium">{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle"}</div>
            <div className="text-xs text-muted-foreground">
              {customer.full_name}
              {customer.mobile ? ` · ${customer.mobile}` : ""}
            </div>
          </div>
          <div className="ml-auto">
            <BrandLogo make={vehicle.make} size={40} />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">This visit</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="mileage">Current mileage / km</Label>
            <Input id="mileage" name="mileage" type="number" min="0" placeholder="e.g. 84000" />
          </div>
        </div>
        <div className="mt-4">
          <Label htmlFor="complaint">Customer complaint</Label>
          <Textarea
            id="complaint"
            name="complaint"
            placeholder="What did the customer report? e.g. Vibration when braking, AC not cooling…"
          />
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

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex justify-end gap-3">
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? "Creating…" : "Create Job Card"}
        </Button>
      </div>
    </form>
  )
}

/* ---------------- Success popup ---------------- */
function JobSuccessDialog({
  result,
  customerEmail,
  customerMobile,
}: {
  result: Extract<JobCreateResult, { ok: true }>
  customerEmail: string | null
  customerMobile: string | null
}) {
  const router = useRouter()
  const [copied, setCopied] = React.useState(false)
  const [resending, setResending] = React.useState(false)
  const [access, setAccess] = React.useState(result.access)
  const [toast, setToast] = React.useState<string | null>(null)

  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const trackingUrl = result.trackingPath ? `${origin}${result.trackingPath}` : null

  async function copyLink() {
    if (!trackingUrl) return
    try {
      await navigator.clipboard.writeText(trackingUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setToast("Your browser blocked copy — long-press the link to copy it.")
    }
  }

  function shareWhatsApp() {
    if (!trackingUrl) return
    const digits = (customerMobile ?? "").replace(/[^\d]/g, "")
    const msg = `Hi ${result.customerName}, your ${result.vehicleLabel} (Job ${result.jobNumber}) has been checked in at SHWURX Garage. Track it live here: ${trackingUrl}`
    const href = digits
      ? `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`
    window.open(href, "_blank", "noopener,noreferrer")
  }

  async function resendEmail() {
    setResending(true)
    setToast(null)
    try {
      const next = await resendCheckInForJob(result.jobId)
      setAccess(next)
      setToast(next.emailStatus === "sent" ? "Email re-sent to the customer." : "Could not re-send the email.")
    } catch {
      setToast("Could not re-send the email.")
    } finally {
      setResending(false)
    }
  }

  const emailBadge =
    access.emailStatus === "sent"
      ? { label: "Email sent", ok: true }
      : access.emailStatus === "failed"
        ? { label: "Email failed", ok: false }
        : { label: access.hasEmail ? "Email skipped" : "No email on file", ok: false }

  const portalBadge =
    access.portalStatus === "created"
      ? { label: "Account created", ok: true }
      : access.portalStatus === "existing"
        ? { label: "Existing account", ok: true }
        : { label: "Account not created", ok: false }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden />
      <Card
        role="dialog"
        aria-modal="true"
        aria-label="Job card created"
        className="relative z-10 w-full max-w-md overflow-hidden p-0"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
              <CircleCheck className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-base font-semibold">Job Card created</h2>
              <p className="text-xs text-muted-foreground">
                {result.jobNumber} · {result.vehicleLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => router.push(`/jobs/${result.jobId}`)}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            <StatusChip ok={portalBadge.ok} label={portalBadge.label} />
            <StatusChip ok={emailBadge.ok} label={emailBadge.label} />
            {access.passwordStatus === "completed" && <StatusChip ok label="Password set" />}
          </div>

          {customerEmail ? (
            <p className="text-sm text-muted-foreground">
              {access.emailStatus === "sent" ? (
                <>
                  A check-in email with tracking and portal links was sent to{" "}
                  <span className="font-medium text-foreground">{customerEmail}</span>.
                </>
              ) : (
                <>
                  We couldn&apos;t email <span className="font-medium text-foreground">{customerEmail}</span>. You can
                  re-send it or share the tracking link directly.
                </>
              )}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              This customer has no email on file, so no portal invite was sent. You can still share the tracking link
              below.
            </p>
          )}

          {trackingUrl && (
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tracking link</Label>
              <p className="mt-1 break-all text-xs text-foreground">{trackingUrl}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={copyLink}>
                  <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={shareWhatsApp}>
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </Button>
                {customerEmail && (
                  <Button type="button" variant="outline" size="sm" onClick={resendEmail} disabled={resending}>
                    {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Resend
                    email
                  </Button>
                )}
                <a href={trackingUrl} target="_blank" rel="noopener noreferrer">
                  <Button type="button" variant="outline" size="sm">
                    <ExternalLink className="h-4 w-4" /> Open
                  </Button>
                </a>
              </div>
            </div>
          )}

          {toast && <p className="text-xs text-muted-foreground">{toast}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (typeof window !== "undefined") window.location.href = "/jobs/new"
              }}
            >
              New job
            </Button>
            <Button type="button" onClick={() => router.push(`/jobs/${result.jobId}`)}>
              Open Job Card
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
        ok ? "bg-primary/15 text-primary" : "bg-amber-500/15 text-amber-500"
      }`}
    >
      {ok ? <CircleCheck className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
      {label}
    </span>
  )
}
