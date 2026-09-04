import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Award, Users, Timer } from "lucide-react"
import { getPublicSiteInfo } from "@/lib/site-info"

export const metadata: Metadata = {
  title: "About — SHWURX Garage",
  description: "Meet the team behind SHWURX Garage — specialist technicians committed to honest, precise auto care.",
}

const STATS = [
  { icon: Users, value: "Expert", label: "Specialist technicians" },
  { icon: Award, value: "Genuine", label: "Parts & warranty-safe work" },
  { icon: Timer, value: "Live", label: "Real-time repair tracking" },
]

export default async function AboutPage() {
  const info = await getPublicSiteInfo()

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl">
            Built on trust and craftsmanship
          </h1>
          <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">
            {info.companyName} was founded on a simple belief: looking after someone&apos;s car should be
            transparent, precise, and completely stress-free. From the moment your vehicle is checked in, you
            see exactly what&apos;s happening and approve every step.
          </p>
          <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">
            Our specialist technicians bring dealer-level experience to every job, backed by proper diagnostics
            and genuine parts — so your car leaves in the condition it deserves.
          </p>
        </div>

        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border">
          <Image
            src="/site/workshop-team.png"
            alt="SHWURX technician inspecting a vehicle"
            fill
            className="object-cover"
          />
        </div>
      </div>

      <div className="mt-16 grid gap-4 sm:grid-cols-3">
        {STATS.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-6">
            <s.icon className="h-6 w-6 text-primary" />
            <div className="mt-4 text-2xl font-bold tracking-tight">{s.value}</div>
            <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-14 flex justify-center">
        <Link
          href="/appointment"
          className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-7 text-base font-semibold text-primary-foreground hover:opacity-90"
        >
          Book with us <ArrowRight className="h-5 w-5" />
        </Link>
      </div>
    </div>
  )
}
