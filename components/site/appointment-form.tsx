"use client"

import { useState } from "react"
import { CheckCircle2, Loader2, Car, Truck, MapPin } from "lucide-react"
import { Button, Field, Input, Label } from "@/components/ui"
import { submitAppointment, track } from "@/lib/site-track"
import { SITE_SERVICES } from "@/lib/site-services"

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

const TYPE_OPTIONS: { value: ApptType; label: string; hint: string; icon: typeof Car }[] = [
  { value: "dropoff", label: "Drop-off at garage", hint: "I'll bring my car in", icon: Car },
  { value: "pickup", label: "Pickup only", hint: "Collect my car from me", icon: MapPin },
  { value: "pickup_delivery", label: "Pickup & delivery", hint: "Collect and return my car", icon: Truck },
]

export function AppointmentForm() {
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<string | null>(null)
  const [apptType, setApptType] = useState<ApptType>("dropoff")
  const [sameAsPickup, setSameAsPickup] = useState(true)

  const needsPickup = apptType === "pickup" || apptType === "pickup_delivery"
  const needsDelivery = apptType === "pickup_delivery"

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
      setError(err instanceof Error ? err.message : "Something went wrong.")
      setStatus("error")
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
          <CheckCircle2 className="h-7 w-7 text-emerald-400" />
        </div>
        <h2 className="mt-4 text-xl font-bold">Request received</h2>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
          {needsPickup
            ? "Thank you. Our team will call you shortly to confirm your appointment and arrange a driver for collection. Keep your phone handy."
            : "Thank you. Our team will call you shortly to confirm your appointment time. Keep your phone handy."}
        </p>
      </div>
    )
  }

  const fieldInputClass =
    "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-card p-6 md:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="name" className="sm:col-span-2">
          <Input id="name" name="name" required placeholder="Your name" />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" required placeholder="05x xxx xxxx" />
        </Field>
        <Field label="Email (optional)" htmlFor="email">
          <Input id="email" name="email" type="email" placeholder="you@email.com" />
        </Field>
        <Field label="Car make" htmlFor="vehicleMake">
          <Input id="vehicleMake" name="vehicleMake" placeholder="e.g. Toyota" />
        </Field>
        <Field label="Car model" htmlFor="vehicleModel">
          <Input id="vehicleModel" name="vehicleModel" placeholder="e.g. Land Cruiser" />
        </Field>
        <Field label="Year" htmlFor="vehicleYear">
          <Input id="vehicleYear" name="vehicleYear" inputMode="numeric" placeholder="2021" />
        </Field>
        <Field label="Plate number" htmlFor="plateNumber">
          <Input id="plateNumber" name="plateNumber" placeholder="A 12345" />
        </Field>
        <Field label="Service needed" htmlFor="serviceInterest" className="sm:col-span-2">
          <select id="serviceInterest" name="serviceInterest" defaultValue="" className={fieldInputClass}>
            <option value="">Select a service…</option>
            {SITE_SERVICES.map((s) => (
              <option key={s.slug} value={s.title}>
                {s.title}
              </option>
            ))}
            <option value="Other">Other / not sure</option>
          </select>
        </Field>
      </div>

      {/* Appointment type */}
      <fieldset className="mt-6">
        <legend className="mb-3 text-sm font-semibold">How would you like to service your car?</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {TYPE_OPTIONS.map((opt) => {
            const Icon = opt.icon
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
            <MapPin className="h-4 w-4 text-primary" /> Pickup details
          </h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Pickup address" htmlFor="pickupAddress" className="sm:col-span-2">
              <textarea
                id="pickupAddress"
                name="pickupAddress"
                required={needsPickup}
                rows={2}
                placeholder="Street, building, apartment/villa no."
                className={fieldInputClass}
              />
            </Field>
            <Field label="Building / villa (optional)" htmlFor="pickupBuilding">
              <Input id="pickupBuilding" name="pickupBuilding" placeholder="e.g. Marina Tower, Villa 12" />
            </Field>
            <Field label="Area / community (optional)" htmlFor="pickupArea">
              <Input id="pickupArea" name="pickupArea" placeholder="e.g. Dubai Marina" />
            </Field>
            <Field label="Emirate" htmlFor="pickupEmirate">
              <select id="pickupEmirate" name="pickupEmirate" defaultValue="Dubai" className={fieldInputClass}>
                {EMIRATES.map((em) => (
                  <option key={em} value={em}>
                    {em}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Google Maps link (optional)" htmlFor="pickupMapsUrl">
              <Input id="pickupMapsUrl" name="pickupMapsUrl" type="url" placeholder="https://maps.google.com/…" />
            </Field>
            <Field label="Preferred pickup date" htmlFor="pickupDate">
              <Input id="pickupDate" name="pickupDate" type="date" />
            </Field>
            <Field label="Preferred pickup time" htmlFor="pickupTime">
              <Input id="pickupTime" name="pickupTime" type="time" />
            </Field>
            <Field label="Pickup instructions (optional)" htmlFor="pickupInstructions" className="sm:col-span-2">
              <textarea
                id="pickupInstructions"
                name="pickupInstructions"
                rows={2}
                placeholder="Gate code, parking spot, who to call…"
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
            <Truck className="h-4 w-4 text-primary" /> Delivery (return) details
          </h3>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="deliverySameAsPickup"
              checked={sameAsPickup}
              onChange={(e) => setSameAsPickup(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-[var(--primary)]"
            />
            Return my car to the same pickup address
          </label>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {!sameAsPickup && (
              <>
                <Field label="Delivery address" htmlFor="deliveryAddress" className="sm:col-span-2">
                  <textarea
                    id="deliveryAddress"
                    name="deliveryAddress"
                    required={needsDelivery && !sameAsPickup}
                    rows={2}
                    placeholder="Where should we return the car?"
                    className={fieldInputClass}
                  />
                </Field>
                <Field label="Google Maps link (optional)" htmlFor="deliveryMapsUrl" className="sm:col-span-2">
                  <Input id="deliveryMapsUrl" name="deliveryMapsUrl" type="url" placeholder="https://maps.google.com/…" />
                </Field>
              </>
            )}
            <Field label="Preferred delivery date" htmlFor="deliveryDate">
              <Input id="deliveryDate" name="deliveryDate" type="date" />
            </Field>
            <Field label="Preferred delivery time" htmlFor="deliveryTime">
              <Input id="deliveryTime" name="deliveryTime" type="time" />
            </Field>
            <Field label="Delivery instructions (optional)" htmlFor="deliveryInstructions" className="sm:col-span-2">
              <textarea
                id="deliveryInstructions"
                name="deliveryInstructions"
                rows={2}
                placeholder="Any notes for returning the car…"
                className={fieldInputClass}
              />
            </Field>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Preferred date" htmlFor="preferredDate">
          <Input id="preferredDate" name="preferredDate" type="date" />
        </Field>
        <Field label="Preferred time" htmlFor="preferredTime">
          <Input id="preferredTime" name="preferredTime" type="time" />
        </Field>
        <Field label="Anything else? (optional)" htmlFor="notes" className="sm:col-span-2">
          <textarea
            id="notes"
            name="notes"
            rows={3}
            placeholder="Describe the issue or any details…"
            className={fieldInputClass}
          />
        </Field>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      <Button type="submit" size="lg" className="mt-6 w-full" disabled={status === "submitting"}>
        {status === "submitting" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Sending…
          </>
        ) : (
          "Request Appointment"
        )}
      </Button>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        No payment required. We&apos;ll confirm your slot by phone.
      </p>
    </form>
  )
}
