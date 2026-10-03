export type ExpenseGroup = "bills" | "operations" | "premises" | "admin"

export interface ExpenseCategory {
  value: string
  label: string
  labelAr: string
  group: ExpenseGroup
  /** Monthly bills get a "bill month" so late or missing bills can be tracked. */
  monthly?: boolean
}

export const EXPENSE_GROUPS: { value: ExpenseGroup; label: string; labelAr: string }[] = [
  { value: "bills", label: "Monthly bills", labelAr: "الفواتير الشهرية" },
  { value: "operations", label: "Workshop operations", labelAr: "تشغيل الورشة" },
  { value: "premises", label: "Premises & equipment", labelAr: "المبنى والمعدات" },
  { value: "admin", label: "Admin & government", labelAr: "الإدارة والجهات الحكومية" },
]

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { value: "dewa", label: "DEWA (electricity & water)", labelAr: "ديوا (كهرباء وماء)", group: "bills", monthly: true },
  { value: "phone", label: "Phone & internet", labelAr: "الهاتف والإنترنت", group: "bills", monthly: true },
  { value: "garbage", label: "Garbage collection", labelAr: "جمع النفايات", group: "bills", monthly: true },
  { value: "rent", label: "Rent", labelAr: "الإيجار", group: "bills", monthly: true },
  { value: "fuel", label: "Petrol / diesel", labelAr: "البنزين / الديزل", group: "operations" },
  { value: "recovery", label: "Recovery / towing", labelAr: "الريكفري / السحب", group: "operations" },
  { value: "materials", label: "Workshop materials & consumables", labelAr: "مواد ومستهلكات الورشة", group: "operations" },
  { value: "tools", label: "Tools & equipment", labelAr: "العدد والمعدات", group: "premises" },
  { value: "maintenance", label: "Building & equipment maintenance", labelAr: "صيانة المبنى والمعدات", group: "premises" },
  { value: "cleaning", label: "Cleaning & supplies", labelAr: "التنظيف والمستلزمات", group: "premises" },
  { value: "government", label: "Trade licence & government fees", labelAr: "الرخصة التجارية والرسوم الحكومية", group: "admin" },
  { value: "visa", label: "Visa & labour fees", labelAr: "رسوم التأشيرات والعمالة", group: "admin" },
  { value: "insurance", label: "Insurance", labelAr: "التأمين", group: "admin" },
  { value: "marketing", label: "Marketing & advertising", labelAr: "التسويق والإعلان", group: "admin" },
  { value: "bank", label: "Bank charges", labelAr: "رسوم بنكية", group: "admin" },
  { value: "other", label: "Other", labelAr: "أخرى", group: "admin" },
]

export const EXPENSE_CATEGORY_MAP: Record<string, ExpenseCategory> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.value, c]),
)

export function expenseCategoryLabel(value: string | null | undefined, lang: "en" | "ar" = "en") {
  const c = value ? EXPENSE_CATEGORY_MAP[value] : undefined
  if (!c) return value || (lang === "ar" ? "أخرى" : "Other")
  return lang === "ar" ? c.labelAr : c.label
}

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash", labelAr: "نقدًا" },
  { value: "bank_transfer", label: "Bank transfer", labelAr: "تحويل بنكي" },
  { value: "card", label: "Card", labelAr: "بطاقة" },
  { value: "cheque", label: "Cheque", labelAr: "شيك" },
  { value: "wps", label: "WPS payroll", labelAr: "نظام حماية الأجور" },
] as const

export const PAYMENT_METHOD_VALUES: string[] = PAYMENT_METHODS.map((m) => m.value)
