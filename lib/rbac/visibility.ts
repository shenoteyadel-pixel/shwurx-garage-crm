import type { Permission } from "@/lib/rbac/roles"

// Client-safe field-visibility helpers. These operate on a plain array of
// permission strings (serializable), so they can be passed from a Server
// Component down to Client Components.

export function hasPerm(perms: string[] | undefined, perm: Permission): boolean {
  return !!perms && perms.includes(perm)
}

export function canViewPrices(perms: string[] | undefined): boolean {
  return hasPerm(perms, "prices.view")
}

export function canViewFinancials(perms: string[] | undefined): boolean {
  return hasPerm(perms, "reports.financial") || hasPerm(perms, "payments.view")
}

/** Mask a currency/price value when the viewer lacks prices.view. */
export function maskPrice<T>(perms: string[] | undefined, value: T): T | null {
  return canViewPrices(perms) ? value : null
}

// Field-level visibility map: which permission gates each sensitive field.
// Used to strip fields from payloads sent to lower-privilege clients.
export const FIELD_PERMISSIONS: Record<string, Permission> = {
  price: "prices.view",
  unit_price: "prices.view",
  total: "prices.view",
  subtotal: "prices.view",
  vat_amount: "prices.view",
  grand_total: "prices.view",
  labor_cost: "prices.view",
  parts_cost: "prices.view",
  profit: "reports.financial",
  cost: "reports.financial",
}

/** Remove price/cost fields from an object when the viewer can't see them. */
export function stripSensitiveFields<T extends Record<string, unknown>>(
  perms: string[] | undefined,
  row: T,
): Partial<T> {
  const out: Partial<T> = { ...row }
  for (const [field, perm] of Object.entries(FIELD_PERMISSIONS)) {
    if (field in out && !hasPerm(perms, perm)) {
      delete out[field as keyof T]
    }
  }
  return out
}
