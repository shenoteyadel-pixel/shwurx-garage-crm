// Categories for per-car (job) expenses recorded from Purchasing. These cover
// the common workshop costs that often arrive WITHOUT a supplier invoice
// (towing, fuel, small cash purchases), which is why they live separately from
// purchase orders / supplier invoices.
export const CAR_EXPENSE_CATEGORIES = [
  { value: "towing", label: "Towing / Recovery" },
  { value: "transport", label: "Transport / Delivery" },
  { value: "fuel", label: "Fuel" },
  { value: "parts", label: "Outside Parts" },
  { value: "sublet", label: "Sublet / Outsourced Work" },
  { value: "labour", label: "External Labour" },
  { value: "consumables", label: "Consumables" },
  { value: "fees", label: "Fees / Fines" },
  { value: "other", label: "Other" },
] as const

export type CarExpenseCategory = (typeof CAR_EXPENSE_CATEGORIES)[number]["value"]

export function carExpenseCategoryLabel(value: string): string {
  return CAR_EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? "Other"
}
