"use client"

import { useState } from "react"
import { Field, Input } from "@/components/ui"
import { servicesForBrand } from "@/lib/website/intake-validate"

export type ContactBrandOption = { slug: string; name: string; models: string[]; serviceSlugs: string[] }
export type ContactServiceOption = { slug: string; name: string }

export const OTHER_MODEL = "__other__"

type Labels = {
  vehicleLegend: string
  vehicleHint: string
  brand: string
  brandAny: string
  model: string
  modelOther: string
  modelOtherLabel: string
  year: string
  yearPlaceholder: string
  service: string
  serviceAny: string
}

const select =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function ContactVehicleFields({
  brands,
  services,
  labels,
  yearInvalid,
}: {
  brands: ContactBrandOption[]
  services: ContactServiceOption[]
  labels: Labels
  yearInvalid?: boolean
}) {
  const [brandSlug, setBrandSlug] = useState("")
  const [model, setModel] = useState("")
  const [serviceSlug, setServiceSlug] = useState("")
  const brand = brands.find((b) => b.slug === brandSlug)
  const models = brand?.models ?? []
  const serviceOptions = servicesForBrand(services, brand ?? null)

  return (
    <fieldset className="grid gap-4 rounded-2xl border border-border p-4 md:p-5">
      <legend className="px-1 text-sm font-semibold">{labels.vehicleLegend}</legend>
      <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">{labels.vehicleHint}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={labels.brand} htmlFor="contact-brand">
          <select
            id="contact-brand"
            name="brand"
            value={brandSlug}
            onChange={(e) => {
              const next = brands.find((b) => b.slug === e.target.value)
              setBrandSlug(e.target.value)
              setModel("")
              if (next && serviceSlug && !next.serviceSlugs.includes(serviceSlug)) setServiceSlug("")
            }}
            className={select}
          >
            <option value="">{labels.brandAny}</option>
            {brands.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={labels.model} htmlFor="contact-model">
          {models.length > 0 ? (
            <select id="contact-model" name="modelChoice" value={model} onChange={(e) => setModel(e.target.value)} className={select}>
              <option value="">{labels.model}</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value={OTHER_MODEL}>{labels.modelOther}</option>
            </select>
          ) : (
            <Input id="contact-model" name="modelText" maxLength={60} dir="auto" className="h-11" />
          )}
        </Field>
        {model === OTHER_MODEL && (
          <Field label={labels.modelOtherLabel} htmlFor="contact-model-other">
            <Input id="contact-model-other" name="modelText" maxLength={60} dir="auto" className="h-11" />
          </Field>
        )}
        <Field label={labels.year} htmlFor="contact-year">
          <Input
            id="contact-year"
            name="year"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            dir="ltr"
            placeholder={labels.yearPlaceholder}
            aria-invalid={yearInvalid || undefined}
            className="h-11"
          />
        </Field>
        <Field label={labels.service} htmlFor="contact-service">
          <select
            id="contact-service"
            name="service"
            value={serviceSlug}
            onChange={(e) => setServiceSlug(e.target.value)}
            className={select}
          >
            <option value="">{labels.serviceAny}</option>
            {serviceOptions.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </fieldset>
  )
}

/** Resolves the model value from the select / free-text pair. */
export function readContactModel(fd: FormData): string {
  const choice = String(fd.get("modelChoice") ?? "")
  const text = String(fd.get("modelText") ?? "").trim()
  if (choice && choice !== OTHER_MODEL) return choice
  return text
}
