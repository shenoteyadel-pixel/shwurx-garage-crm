export const CATALOG_ITEM_TYPES = [
  { value: "part", label: "Part" },
  { value: "consumable", label: "Consumable" },
  { value: "oil", label: "Oil / fluid" },
] as const

export const CATALOG_QUALITIES = [
  { value: "genuine", label: "Genuine" },
  { value: "oem_oes", label: "OEM / OES" },
  { value: "aftermarket", label: "Aftermarket" },
  { value: "used", label: "Used" },
  { value: "refurbished", label: "Refurbished" },
] as const

export type CatalogItemType = (typeof CATALOG_ITEM_TYPES)[number]["value"]
export type CatalogQuality = (typeof CATALOG_QUALITIES)[number]["value"]

export type CatalogSpec = {
  item_type: CatalogItemType
  name: string
  brand: string | null
  manufacturer: string | null
  part_number: string | null
  quality: CatalogQuality
  condition: string | null
  specification: string | null
  product_line: string | null
  viscosity: string | null
  approvals: string | null
  package_size: string | null
  unit: string
  used_item_ref: string | null
  warranty_months: number | null
}

const TEXT_FIELDS = [
  "brand",
  "manufacturer",
  "part_number",
  "condition",
  "specification",
  "product_line",
  "viscosity",
  "approvals",
  "package_size",
  "used_item_ref",
] as const

function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim().replace(/\s+/g, " ")
  return text.length ? text.slice(0, 200) : null
}

export function normalizeCatalogSpec(input: Record<string, unknown>): CatalogSpec {
  const itemType = CATALOG_ITEM_TYPES.some((t) => t.value === input.item_type)
    ? (input.item_type as CatalogItemType)
    : "part"
  const quality = CATALOG_QUALITIES.some((q) => q.value === input.quality)
    ? (input.quality as CatalogQuality)
    : ("" as CatalogQuality)
  const warrantyRaw = input.warranty_months
  const warranty =
    warrantyRaw === null || warrantyRaw === undefined || String(warrantyRaw).trim() === ""
      ? null
      : Number(warrantyRaw)

  const spec: CatalogSpec = {
    item_type: itemType,
    name: clean(input.name) ?? "",
    quality,
    unit: clean(input.unit) ?? "each",
    warranty_months: warranty,
    brand: null,
    manufacturer: null,
    part_number: null,
    condition: null,
    specification: null,
    product_line: null,
    viscosity: null,
    approvals: null,
    package_size: null,
    used_item_ref: null,
  }
  for (const field of TEXT_FIELDS) spec[field] = clean(input[field])
  return spec
}

/** Mirrors the database constraints so staff see a clear message before saving. */
export function validateCatalogSpec(spec: CatalogSpec): string | null {
  if (!spec.name) return "Enter the item name."
  if (!CATALOG_QUALITIES.some((q) => q.value === spec.quality)) return "Choose the part quality."
  if (spec.warranty_months !== null && (!Number.isInteger(spec.warranty_months) || spec.warranty_months < 0)) {
    return "Warranty must be a whole number of months (0 or more)."
  }
  if (spec.item_type === "oil") {
    const missing = [
      !spec.manufacturer && "brand",
      !spec.product_line && "product line",
      !spec.viscosity && "viscosity",
      !spec.package_size && "pack size",
    ].filter(Boolean)
    if (missing.length) return `Oil needs its exact ${missing.join(", ")}.`
  }
  if ((spec.quality === "used" || spec.quality === "refurbished") && (!spec.condition || spec.warranty_months === null)) {
    return "Used and refurbished parts need a condition and a warranty period (0 if none)."
  }
  if (spec.item_type !== "oil" && !spec.part_number && !spec.specification) {
    return "Enter a part number or an exact specification so this item can't be confused with another."
  }
  return null
}

export function validateSellingPrice(value: unknown): string | null {
  const price = Number(value)
  if (!Number.isFinite(price) || price <= 0) return "Enter a selling price above zero."
  if (Math.round(price * 100) !== price * 100 && Math.abs(Math.round(price * 100) - price * 100) > 1e-6) {
    return "Prices can have at most two decimals."
  }
  if (price > 1_000_000) return "That price looks too high."
  return null
}

export function catalogSpecLabel(spec: Partial<CatalogSpec>): string {
  const quality = CATALOG_QUALITIES.find((q) => q.value === spec.quality)?.label
  return [
    spec.manufacturer || spec.brand,
    spec.product_line,
    spec.viscosity,
    spec.specification,
    spec.package_size,
    spec.part_number ? `P/N ${spec.part_number}` : null,
    quality,
    spec.condition ? `Condition: ${spec.condition}` : null,
    spec.warranty_months !== null && spec.warranty_months !== undefined
      ? spec.warranty_months === 0
        ? "No warranty"
        : `${spec.warranty_months}-month warranty`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

/** Catalog prices are ex-VAT. VAT-inclusive quotations show the VAT-inclusive unit price. */
export function quoteUnitPrice(sellingPrice: number, vatRate: number, vatInclusive: boolean): number {
  const price = vatInclusive ? sellingPrice * (1 + vatRate / 100) : sellingPrice
  return Math.round(price * 100) / 100
}

export function pricesMatch(a: number, b: number): boolean {
  return Math.abs(Number(a) - Number(b)) < 0.005
}
