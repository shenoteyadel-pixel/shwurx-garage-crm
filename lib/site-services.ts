import { Wrench, Gauge, Cog, Sparkles, ShieldCheck, Battery } from "lucide-react"

export type SiteService = {
  slug: string
  title: string
  icon: typeof Wrench
  summary: string
}

export const SITE_SERVICES: SiteService[] = [
  {
    slug: "major-service",
    title: "Major & Minor Service",
    icon: Wrench,
    summary: "Full manufacturer-schedule servicing with genuine parts and a detailed digital report.",
  },
  {
    slug: "diagnostics",
    title: "Computer Diagnostics",
    icon: Gauge,
    summary: "Dealer-level fault scanning to pinpoint issues fast — no guesswork, no surprises.",
  },
  {
    slug: "engine-repair",
    title: "Engine & Mechanical",
    icon: Cog,
    summary: "From timing chains to full rebuilds, handled by specialist technicians.",
  },
  {
    slug: "detailing",
    title: "Detailing & Care",
    icon: Sparkles,
    summary: "Interior and exterior detailing, ceramic coating, and paint correction.",
  },
  {
    slug: "ac-electrical",
    title: "A/C & Electrical",
    icon: Battery,
    summary: "Climate systems, batteries, and electrical faults diagnosed and repaired.",
  },
  {
    slug: "inspection",
    title: "Pre-Purchase Inspection",
    icon: ShieldCheck,
    summary: "A thorough independent check before you buy, with an honest written verdict.",
  },
]
