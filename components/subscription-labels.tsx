import type { BillingCycle, DueState, SubscriptionCategory } from "@/lib/subscriptions"

export const CATEGORY_LABEL: Record<SubscriptionCategory, string> = {
  hosting: "Hosting",
  database: "Database",
  domain_dns: "Domain & DNS",
  email_workspace: "Email & workspace",
  messaging: "WhatsApp & messaging",
  marketing: "Marketing & ads",
  ai_api: "AI & APIs",
  ssl: "SSL certificate",
  email_delivery: "Email delivery",
  backup: "Backup & storage",
  software_license: "Software license",
  diagnostic_tool: "Diagnostic tool",
  crm_integration: "CRM integration",
  other: "Other",
}

export const CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  custom: "Custom",
}

export const DUE_LABEL: Record<DueState, string> = {
  overdue: "Overdue",
  due_today: "Due today",
  due_soon: "Due soon",
  upcoming: "Upcoming",
  resolved: "Handled",
  inactive: "Inactive",
}

export const DUE_TONE: Record<DueState, string> = {
  overdue: "border-red-500/40 bg-red-500/15 text-red-300",
  due_today: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  due_soon: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  upcoming: "border-border bg-secondary text-muted-foreground",
  resolved: "border-border bg-secondary text-muted-foreground",
  inactive: "border-border bg-transparent text-muted-foreground",
}

export const CRIT_TONE: Record<string, string> = {
  critical: "text-red-300",
  high: "text-amber-300",
  medium: "text-foreground",
  low: "text-muted-foreground",
}

export function money(n: number, currency = "AED") {
  return `${currency} ${n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
