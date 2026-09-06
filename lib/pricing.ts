export type PricingMethod = "markup" | "margin"

/**
 * Suggested retail sale price from a cost.
 * - markup: sell = cost * (1 + pct/100)   e.g. 35% markup on 100 -> 135
 * - margin: sell = cost / (1 - pct/100)   e.g. 35% target margin on 100 -> 153.85
 * Margin percentages are capped below 100 to avoid a divide-by-zero blow-up.
 */
export function suggestSalePrice(cost: number, method: PricingMethod, pct: number): number {
  const c = Number(cost) || 0
  const p = Number(pct) || 0
  if (c <= 0) return 0
  const price = method === "margin" ? c / (1 - Math.min(p, 95) / 100) : c * (1 + p / 100)
  return Math.round(price * 100) / 100
}

/** Effective margin percentage a given sale price yields over cost. */
export function marginPct(cost: number, sale: number): number {
  const s = Number(sale) || 0
  if (s <= 0) return 0
  return Math.round(((s - (Number(cost) || 0)) / s) * 1000) / 10
}
