"use client"

import { useState } from "react"
import Link from "next/link"
import { Search } from "lucide-react"

export interface FinderBrand {
  slug: string
  name: string
  models: string[]
}

export interface FinderService {
  slug: string
  name: string
}

export interface FinderLabels {
  heading: string
  hint: string
  brand: string
  model: string
  service: string
  search: string
  allBrands: string
  allModels: string
  pickBrandFirst: string
  allServices: string
  apply: string
  clear: string
}

const field =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"

export function CarFinder({
  action,
  clearHref,
  brands,
  services,
  labels,
  initial,
  filtered,
}: {
  action: string
  clearHref: string
  brands: FinderBrand[]
  services: FinderService[]
  labels: FinderLabels
  initial: { brand: string; model: string; service: string; q: string }
  filtered: boolean
}) {
  const [brand, setBrand] = useState(initial.brand)
  const [model, setModel] = useState(initial.model)
  const models = brands.find((b) => b.slug === brand)?.models ?? []

  return (
    <form method="get" action={action} role="search" className="mt-10 rounded-2xl border border-border bg-card p-5 lg:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">{labels.heading}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{labels.hint}</p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {labels.brand}
          <select
            name="brand"
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value)
              setModel("")
            }}
            className={field}
          >
            <option value="">{labels.allBrands}</option>
            {brands.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {labels.model}
          <select
            name="model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={models.length === 0}
            className={field}
          >
            <option value="">{brand ? labels.allModels : labels.pickBrandFirst}</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {labels.service}
          <select name="service" defaultValue={initial.service} className={field}>
            <option value="">{labels.allServices}</option>
            {services.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {labels.search}
          <span className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input type="search" name="q" defaultValue={initial.q} maxLength={80} className={`${field} ps-9`} />
          </span>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" className="h-11 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground hover:opacity-90">
          {labels.apply}
        </button>
        {filtered && (
          <Link href={clearHref} className="inline-flex h-11 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">
            {labels.clear}
          </Link>
        )}
      </div>
    </form>
  )
}
