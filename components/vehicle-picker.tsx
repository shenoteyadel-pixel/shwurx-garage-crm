"use client"

import * as React from "react"
import { Combo, Input, Label, Select } from "@/components/ui"
import { BODY_TYPES, inferBodyType, MODEL_SUGGESTIONS } from "@/lib/vehicle"
import { COMMON_COLORS } from "@/lib/constants"
import {
  catalogBodyType,
  catalogMakeNames,
  defaultYearFor,
  modelsForYear,
  searchCatalog,
  variantsForModelYear,
  yearOptions,
  type CatalogSearchResult,
} from "@/lib/vehicle-catalog"
import { Search, X } from "lucide-react"

export type VehicleDraft = {
  make: string
  model: string
  variant: string
  year: string // kept as string so an empty selection is representable
  color: string
  bodyType: string
}

export const EMPTY_VEHICLE_DRAFT: VehicleDraft = {
  make: "",
  model: "",
  variant: "",
  year: "",
  color: "",
  bodyType: "",
}

/**
 * Year-aware vehicle selector backed by the structured catalog.
 * Flow: search  |  Make -> Year -> Model -> Variant  (+ Colour, Body type).
 * Free text is always allowed, so a vehicle missing from the catalog can still
 * be recorded. Renders inputs with the same `name`s the intake forms already
 * submit (vehicle_make / vehicle_model / variant / vehicle_year / color /
 * body_type), so nothing downstream changes.
 */
export function VehiclePicker({
  value,
  onChange,
}: {
  value: VehicleDraft
  onChange: (patch: Partial<VehicleDraft>) => void
}) {
  const [query, setQuery] = React.useState("")
  const results = React.useMemo(() => searchCatalog(query), [query])
  const [open, setOpen] = React.useState(false)

  const yearNum = value.year ? Number(value.year) : null
  const makeOptions = React.useMemo(() => catalogMakeNames(), [])
  const modelOptions = React.useMemo(() => {
    const catalog = modelsForYear(value.make, yearNum)
    return catalog.length ? catalog : MODEL_SUGGESTIONS[value.make] ?? []
  }, [value.make, yearNum])
  const variantOptions = React.useMemo(
    () => variantsForModelYear(value.make, value.model, yearNum),
    [value.make, value.model, yearNum],
  )
  const years = React.useMemo(() => yearOptions(value.make, value.model), [value.make, value.model])

  const detectedBody = catalogBodyType(value.make, value.model) ?? inferBodyType(value.make, value.model)
  const effectiveBody = value.bodyType || detectedBody

  function applySearch(r: CatalogSearchResult) {
    onChange({
      make: r.make,
      model: r.model,
      variant: r.variant ?? "",
      year: String(defaultYearFor(r)),
      bodyType: "", // let it auto-detect from the resolved make/model
    })
    setQuery("")
    setOpen(false)
  }

  return (
    <div className="space-y-4">
      {/* Quick search — e.g. SL63, 720S, S580 */}
      <div className="relative">
        <Label htmlFor="vehicle-search">Quick find</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="vehicle-search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            placeholder="Type a model, e.g. SL63, 720S, S580, Purosangue"
            className="pl-9 pr-9"
            aria-autocomplete="list"
            aria-expanded={open && results.length > 0}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("")
                setOpen(false)
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {open && results.length > 0 && (
          <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-xl scrollbar-thin">
            {results.map((r) => (
              <li key={r.label}>
                <button
                  type="button"
                  onClick={() => applySearch(r)}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span className="min-w-0 truncate font-medium">{r.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{r.sublabel}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label htmlFor="vehicle_make">Make</Label>
          <Combo
            id="vehicle_make"
            name="vehicle_make"
            placeholder="e.g. Mercedes-Benz"
            options={makeOptions}
            value={value.make}
            onChange={(e) =>
              // Changing the make invalidates the previously chosen model/variant.
              onChange({ make: e.target.value, model: "", variant: "" })
            }
          />
        </div>
        <div>
          <Label htmlFor="vehicle_year">Year</Label>
          <Select
            id="vehicle_year"
            name="vehicle_year"
            value={value.year}
            onChange={(e) => onChange({ year: e.target.value })}
          >
            <option value="">Any / unknown</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="vehicle_model">Model</Label>
          <Combo
            id="vehicle_model"
            name="vehicle_model"
            placeholder={value.make ? "Select or type a model" : "Pick a make first"}
            options={modelOptions}
            value={value.model}
            onChange={(e) => onChange({ model: e.target.value, variant: "" })}
          />
        </div>
        <div>
          <Label htmlFor="variant">Variant / trim</Label>
          <Combo
            id="variant"
            name="variant"
            placeholder={variantOptions.length ? "Select or type a trim" : "e.g. AMG, GT, Sport"}
            options={variantOptions.length ? variantOptions : ["AMG", "GT", "GTS", "Sport", "M Sport", "S-Line", "Limited", "Platinum"]}
            value={value.variant}
            onChange={(e) => onChange({ variant: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="color">Color</Label>
          <Combo
            id="color"
            name="color"
            placeholder="e.g. Pearl White"
            options={COMMON_COLORS}
            value={value.color}
            onChange={(e) => onChange({ color: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="body_type">Body type</Label>
          <Select
            id="body_type"
            name="body_type"
            value={value.bodyType}
            onChange={(e) => onChange({ bodyType: e.target.value })}
          >
            <option value="">Auto-detect ({BODY_TYPES.find((b) => b.value === effectiveBody)?.label ?? "Sedan"})</option>
            {BODY_TYPES.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  )
}
