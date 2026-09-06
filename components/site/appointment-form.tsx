"use client"

import { useState } from "react"
import { CheckCircle2, Loader2, Car, Truck, MapPin } from "lucide-react"
import { Button, Field, Input } from "@/components/ui"
import { submitAppointment, track } from "@/lib/site-track"
import { SITE_SERVICES } from "@/lib/site-services"
import { useI18n } from "@/lib/i18n/provider"

type Status = "idle" | "submitting" | "done" | "error"
type ApptType = "dropoff" | "pickup" | "pickup_delivery"

const EMIRATES = [
  "Dubai",
  "Abu Dhabi",
  "Sharjah",
  "Ajman",
  "Ras Al Khaimah",
  "Fujairah",
  "Umm Al Quwain",
]

const TYPE_ICON: Record<ApptType, typeof Car> = {
  dropoff: Car,
  pickup: MapPin,
  pickup_delivery: Truck,
}

export function AppointmentForm() {
  const { t, dir } = useI18n()
  const f = t.appointmentForm
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<string | null>(null)
  const [apptType, setApptType] = useState<ApptType>("dropoff")
  const [sameAsPickup, setSameAsPickup] = useState(true)

  const needsPickup = apptType === "pickup" || apptType === "pickup_delivery"
  const needsDelivery = apptType === "pickup_delivery"

  const typeOptions: { value: ApptType; label: string; hint: string }[] = [
    { value: "dropoff", label: f.types.dropoff.label, hint: f.types.dropoff.hint },
    { value: "pickup", label: f.types.pickup.label, hint: f.types.pickup.hint },
    { value: "pickup_delivery", label: f.types.pickup_delivery.label, hint: f.types.pickup_delivery.hint },
  ]

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (status === "submitting") return
    setStatus("submitting")
    setError(null)
    const fd = new FormData(e.currentTarget)

    let logistics: Record<string, unknown> | undefined
    if (needsPickup) {
      const pickup = {
        address: (fd.get("pickupAddress") as string) || "",
        mapsUrl: (fd.get("pickupMapsUrl") as string) || "",
        building: (fd.get("pickupBuilding") as string) || "",
        area: (fd.get("pickupArea") as string) || "",
        emirate: (fd.get("pickupEmirate") as string) || "",
        date: (fd.get("pickupDate") as string) || "",
        time: (fd.get("pickupTime") as string) || "",
        instructions: (fd.get("pickupInstructions") as string) || "",
      }
      logistics = { type: apptType, pickup }
      if (needsDelivery) {
        logistics.delivery = {
          sameAsPickup,
          address: sameAsPickup ? pickup.address : (fd.get("deliveryAddress") as string) || "",
          mapsUrl: sameAsPickup ? pickup.mapsUrl : (fd.get("deliveryMapsUrl") as string) || "",
          date: (fd.get("deliveryDate") as string) || "",
          time: (fd.get("deliveryTime") as string) || "",
          instructions: (fd.get("deliveryInstructions") as string) || "",
        }
      }
    } else {
      logistics = { type: "dropoff" }
    }

    try {
      await submitAppointment({
        name: fd.get("name"),
        phone: fd.get("phone"),
        email: fd.get("email") || null,
        vehicleMake: fd.get("vehicleMake") || null,
        vehicleModel: fd.get("vehicleModel") || null,
        vehicleYear: fd.get("vehicleYear") || null,
        plateNumber: fd.get("plateNumber") || null,
        serviceInterest: fd.get("serviceInterest") || null,
        preferredDate: fd.get("preferredDate") || null,
        preferredTime: fd.get("preferredTime") || null,
        notes: fd.get("notes") || null,
        source: "website",
        metadata: { logistics },
      })
      track("appointment_request", { service: fd.get("serviceInterest") || null, type: apptType })
      setStatus("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : f.errGeneric)
      setStatus("error")
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
          <CheckCircle2 className="h-7 w-7 text-emerald-400" />
        </div>
        <h2 className="mt-4 text-xl font-bold">{f.doneTitle}</h2>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
          {needsPickup ? f.doneBodyPickup : f.doneBodyDropoff}
        </p>
      </div>
    )
  }

  const fieldInputClass =
    "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

  return (
    <form onSubmit={onSubmit} dir={dir} className="rounded-2xl border border-border bg-card p-6 md:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={f.fullName} htmlFor="name" className="sm:col-span-2">
          <Input id="name" name="name" required placeholder={f.fullNamePlaceholder} />
        </Field>
        <Field label={f.phone} htmlFor="phone">
          <Input id="phone" name="phone" type="tel" required placeholder="05x xxx xxxx" />
        </Field>
        <Field label={f.email} htmlFor="email">
          <Input id="email" name="email" type="email" placeholder="you@email.com" />
        </Field>
        <Field label={f.carMake} htmlFor="vehicleMake">
          <Input id="vehicleMake" name="vehicleMake" placeholder={f.carMakePlaceholder} />
        </Field>
        <Field label={f.carModel} htmlFor="vehicleModel">
          <Input id="vehicleModel" name="vehicleModel" placeholder={f.carModelPlaceholder} />
        </Field>
        <Field label={f.year} htmlFor="vehicleYear">
          <Input id="vehicleYear" name="vehicleYear" inputMode="numeric" placeholder="2021" />
        </Field>
        <Field label={f.plate} htmlFor="plateNumber">
          <Input id="plateNumber" name="plateNumber" placeholder="A 12345" />
        </Field>
        <Field label={f.serviceNeeded} htmlFor="serviceInterest" className="sm:col-span-2">
          <select id="serviceInterest" name="serviceInterest" defaultValue="" className={fieldInputClass}>
            <option value="">{f.selectService}</option>
            {SITE_SERVICES.map((s) => (
              <option key={s.slug} value={s.title}>
                {t.services[s.slug as keyof typeof t.services]?.title ?? s.title}
              </option>
            ))}
            <option value="Other">{f.otherService}</option>
          </select>
        </Field>
      </div>

      {/* Appointment type */}
      <fieldset className="mt-6">
        <legend className="mb-3 text-sm font-semibold">{f.typeLegend}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {typeOptions.map((opt) => {
            const Icon = TYPE_ICON[opt.value]
            const active = apptType === opt.value
            return (
              <label
                key={opt.value}
                className={`flex cursor-pointer flex-col gap-1.5 rounded-xl border p-3 transition ${
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background hover:border-muted-foreground/40"
                }`}
              >
                <input
                  type="radio"
                  name="appointmentType"
                  value={opt.value}
                  checked={active}
                  onChange={() => setApptType(opt.value)}
                  className="sr-only"
                />
                <Icon className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                <span className="text-sm font-medium">{opt.label}</span>
                <span className="text-xs text-muted-foreground">{opt.hint}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {/* Pickup details */}
      {needsPickup && (
        <div className="mt-5 rounded-xl border border-border bg-background/50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="h-4 w-4 text-primary" /> {f.pickupDetails}
          </h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label={f.pickupAddress} htmlFor="pickupAddress" className="sm:col-span-2">
              <textarea
                id="pickupAddress"
                name="pickupAddress"
                required={needsPickup}
                rows={2}
                placeholder={f.pickupAddressPlaceholder}
                className={fieldInputClass}
              />
            </Field>
            <Field label={f.building} htmlFor="pickupBuilding">
              <Input id="pickupBuilding" name="pickupBuilding" placeholder={f.buildingPlaceholder} />
            </Field>
            <Field label={f.area} htmlFor="pickupArea">
              <Input id="pickupArea" name="pickupArea" placeholder={f.areaPlaceholder} />
            </Field>
            <Field label={f.emirate} htmlFor="pickupEmirate">
              <select id="pickupEmirate" name="pickupEmirate" defaultValue="Dubai" className={fieldInputClass}>
                {EMIRATES.map((em) => (
                  <option key={em} value={em}>
                    {f.emirates[em as keyof typeof f.emirates] ?? em}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={f.mapsLink} htmlFor="pickupMapsUrl">
              <Input id="pickupMapsUrl" name="pickupMapsUrl" type="url" placeholder="https://maps.google.com/…" />
            </Field>
            <Field label={f.pickupDate} htmlFor="pickupDate">
              <Input id="pickupDate" name="pickupDate" type="date" />
            </Field>
            <Field label={f.pickupTime} htmlFor="pickupTime">
              <Input id="pickupTime" name="pickupTime" type="time" />
            </Field>
            <Field label={f.pickupInstructions} htmlFor="pickupInstructions" className="sm:col-span-2">
              <textarea
                id="pickupInstructions"
                name="pickupInstructions"
                rows={2}
                placeholder={f.pickupInstructionsPlaceholder}
                className={fieldInputClass}
              />
            </Field>
          </div>
        </div>
      )}

      {/* Delivery details */}
      {needsDelivery && (
        <div className="mt-4 rounded-xl border border-border bg-background/50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Truck className="h-4 w-4 text-primary" /> {f.deliveryDetails}
          </h3>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="deliverySameAsPickup"
              checked={sameAsPickup}
              onChange={(e) => setSameAsPickup(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-[var(--primary)]"
            />
            {f.deliverySameAddress}
          </label>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {!sameAsPickup && (
              <>
                <Field label={f.deliveryAddress} htmlFor="deliveryAddress" className="sm:col-span-2">
                  <textarea
                    id="deliveryAddress"
                    name="deliveryAddress"
                    required={needsDelivery && !sameAsPickup}
                    rows={2}
                    placeholder={f.deliveryAddressPlaceholder}
                    className={fieldInputClass}
                  />
                </Field>
                <Field label={f.mapsLink} htmlFor="deliveryMapsUrl" className="sm:col-span-2">
                  <Input id="deliveryMapsUrl" name="deliveryMapsUrl" type="url" placeholder="https://maps.google.com/…" />
                </Field>
              </>
            )}
            <Field label={f.deliveryDate} htmlFor="deliveryDate">
              <Input id="deliveryDate" name="deliveryDate" type="date" />
            </Field>
            <Field label={f.deliveryTime} htmlFor="deliveryTime">
              <Input id="deliveryTime" name="deliveryTime" type="time" />
            </Field>
            <Field label={f.deliveryInstructions} htmlFor="deliveryInstructions" className="sm:col-span-2">
              <textarea
                id="deliveryInstructions"
                name="deliveryInstructions"
                rows={2}
                placeholder={f.deliveryInstructionsPlaceholder}
                className={fieldInputClass}
              />
            </Field>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label={f.preferredDate} htmlFor="preferredDate">
          <Input id="preferredDate" name="preferredDate" type="date" />
        </Field>
        <Field label={f.preferredTime} htmlFor="preferredTime">
          <Input id="preferredTime" name="preferredTime" type="time" />
        </Field>
        <Field label={f.notes} htmlFor="notes" className="sm:col-span-2">
          <textarea
            id="notes"
            name="notes"
            rows={3}
            placeholder={f.notesPlaceholder}
            className={fieldInputClass}
          />
        </Field>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      <Button type="submit" size="lg" className="mt-6 w-full" disabled={status === "submitting"}>
        {status === "submitting" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> {f.submitting}
          </>
        ) : (
          f.submit
        )}
      </Button>
      <p className="mt-3 text-center text-xs text-muted-foreground">{f.disclaimer}</p>
    </form>
  )
}
