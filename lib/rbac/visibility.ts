import type { Permission } from "@/lib/rbac/roles"

// Client-safe field-visibility helpers. These operate on a plain array of
// permission strings (serializable), so they can be passed from a Server
// Component down to Client Components.

export function hasPerm(perms: string[] | undefined, perm: Permission): boolean {
  return !!perms && perms.includes(perm)
}

/** Selling prices & totals shown to customers (quotes, invoices, job totals). */
export function canViewPrices(perms: string[] | undefined): boolean {
  return hasPerm(perms, "prices.view")
}

/** Purchase / supplier cost — what SHWURX pays for a part (never the sell price). */
export function canViewCosts(perms: string[] | undefined): boolean {
  return hasPerm(perms, "costs.view")
}

/** Supplier identity (who we buy from, their contact/pricing terms). */
export function canViewSuppliers(perms: string[] | undefined): boolean {
  return hasPerm(perms, "suppliers.view")
}

/** Profit / margin figures (derived from sell minus cost). */
export function canViewProfit(perms: string[] | undefined): boolean {
  return hasPerm(perms, "profit.view")
}

export function canViewFinancials(perms: string[] | undefined): boolean {
  return hasPerm(perms, "reports.financial") || hasPerm(perms, "payments.view")
}

/** Mask a currency/price value when the viewer lacks prices.view. */
export function maskPrice<T>(perms: string[] | undefined, value: T): T | null {
  return canViewPrices(perms) ? value : null
}

/** Mask a purchase-cost value when the viewer lacks costs.view. */
export function maskCost<T>(perms: string[] | undefined, value: T): T | null {
  return canViewCosts(perms) ? value : null
}

// Field-level visibility map: which permission gates each sensitive field.
// Used to strip fields from payloads sent to lower-privilege clients.
// Selling price/totals, purchase cost, supplier identity and profit are each
// gated independently so e.g. Parts can see cost but not the sell price.
export const FIELD_PERMISSIONS: Record<string, Permission> = {
  // Selling prices & customer-facing totals
  price: "prices.view",
  sale_price: "prices.view",
  unit_price: "prices.view",
  total: "prices.view",
  subtotal: "prices.view",
  vat_amount: "prices.view",
  grand_total: "prices.view",
  labour_total: "prices.view",
  parts_total: "prices.view",
  labor_cost: "prices.view",
  // Purchase / supplier cost
  cost: "costs.view",
  cost_price: "costs.view",
  unit_cost: "costs.view",
  parts_cost: "costs.view",
  opening_balance: "costs.view",
  credit_terms: "costs.view",
  // Supplier identity
  supplier_id: "suppliers.view",
  supplier_name: "suppliers.view",
  supplier_invoice_no: "suppliers.view",
  // Profit / margin
  profit: "profit.view",
  margin: "profit.view",
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
