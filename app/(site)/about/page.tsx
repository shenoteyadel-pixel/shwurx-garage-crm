import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Award, Users, Timer } from "lucide-react"
import { getPublicSiteInfo } from "@/lib/site-info"
import { getServerI18n } from "@/lib/i18n/server"
import { interpolate } from "@/lib/i18n/dictionaries"

export const metadata: Metadata = {
  title: "About — SHWURX Auto Service Center",
  description: "Meet the team behind SHWURX Auto Service Center — specialist technicians committed to honest, precise auto care.",
}

const STAT_ICONS = [Users, Award, Timer]

export default async function AboutPage() {
  const [info, { dict }] = await Promise.all([getPublicSiteInfo(), getServerI18n()])
  const t = dict.aboutPage

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl">{t.title}</h1>
          <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">
            {interpolate(t.body1, { company: info.companyName })}
          </p>
          <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">{t.body2}</p>
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
        {t.stats.map((s, i) => {
          const Icon = STAT_ICONS[i]
          return (
            <div key={s.label} className="rounded-2xl border border-border bg-card p-6">
              <Icon className="h-6 w-6 text-primary" />
              <div className="mt-4 text-2xl font-bold tracking-tight">{s.value}</div>
              <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
            </div>
          )
        })}
      </div>

      <div className="mt-14 flex justify-center">
        <Link
          href="/appointment"
          className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-7 text-base font-semibold text-primary-foreground hover:opacity-90"
        >
          {t.bookWithUs} <ArrowRight className="h-5 w-5 rtl:rotate-180" />
        </Link>
      </div>
    </div>
  )
}
