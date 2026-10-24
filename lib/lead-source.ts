import type { LeadRow } from "@/lib/actions-leads"
import { leadCampaignName } from "@/lib/lead-origin"

export type LeadSourceKey = "all" | "google_ads" | "meta" | "website"

export const SOURCE_FILTERS: { key: LeadSourceKey; label: string }[] = [
  { key: "all", label: "All sources" },
  { key: "google_ads", label: "Google Ads" },
  { key: "meta", label: "Meta (Facebook / Instagram)" },
  { key: "website", label: "Website & other" },
]

export function leadSourceKey(source: string | null): Exclude<LeadSourceKey, "all"> {
  if (source === "google_ads") return "google_ads"
  if (source === "facebook" || source === "instagram") return "meta"
  return "website"
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return ""
  let text = String(value)
  // Stop spreadsheet apps from treating text as a formula.
  if (/^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function leadsToCsv(leads: LeadRow[]): string {
  const header = ["Name", "Phone", "Email", "Source", "Status", "Service interest", "Message", "Campaign", "Assigned to", "Created at"]
  const rows = leads.map((l) => {
    const md = l.metadata ?? {}
    return [
      l.name,
      l.phone,
      l.email,
      l.source,
      l.status,
      l.service_interest,
      l.message,
      leadCampaignName(md) ?? "",
      md.assigned_name ?? "",
      (l as unknown as { created_at?: string }).created_at ?? "",
    ]
      .map(cell)
      .join(",")
  })
  return "\uFEFF" + [header.map(cell).join(","), ...rows].join("\r\n")
}
