import { Cpu, CalendarCheck, Cog, Package, SprayCan, Gauge } from "lucide-react"

export type SiteService = {
  slug: string
  title: string
  icon: typeof Cpu
  summary: string
}

export const SITE_SERVICES: SiteService[] = [
  {
    slug: "diagnostics-programming",
    title: "Diagnostics & Programming",
    icon: Cpu,
    summary: "Dealer level diagnostics for all premium brands.",
  },
  {
    slug: "scheduled-maintenance",
    title: "Scheduled Maintenance",
    icon: CalendarCheck,
    summary: "Keep your vehicle at its best.",
  },
  {
    slug: "mechanical-repair",
    title: "Mechanical Repair",
    icon: Cog,
    summary: "Expert repair for all systems.",
  },
  {
    slug: "parts-procurement",
    title: "Parts & Procurement",
    icon: Package,
    summary: "Genuine & OEM parts sourcing.",
  },
  {
    slug: "body-paint",
    title: "Body & Paint",
    icon: SprayCan,
    summary: "Professional bodywork and refinishing.",
  },
  {
    slug: "performance-upgrades",
    title: "Performance & Upgrades",
    icon: Gauge,
    summary: "Unlock the full potential.",
  },
]
