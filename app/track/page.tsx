import type { Metadata } from "next"
import Link from "next/link"
import { Wrench, Radar, ArrowLeft } from "lucide-react"
import { TrackEntry } from "@/components/site/track-entry"
import { getServerI18n } from "@/lib/i18n/server"
import { dirFor } from "@/lib/i18n/config"

export const metadata: Metadata = {
  title: "Track Your Vehicle — SHWURX Auto Service Center",
  description: "Enter your tracking code to follow your vehicle's progress in real time.",
}

export default async function TrackEntryPage() {
  const { locale, dict: t } = await getServerI18n()
  const e = t.trackEntry
  const dir = dirFor(locale)

  return (
    <main dir={dir} className="flex min-h-svh flex-col bg-background px-4 py-16 text-foreground">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" /> {e.backHome}
        </Link>

        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <Wrench className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-base font-bold tracking-tight">
            SHWURX <span className="text-primary">{t.brand.tagline}</span>
          </span>
        </div>

        <div className="mt-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Radar className="h-7 w-7 text-primary" />
        </div>
        <h1 className="mt-5 text-balance text-3xl font-bold tracking-tight md:text-4xl">{e.title}</h1>
        <p className="mt-3 text-pretty text-base leading-relaxed text-muted-foreground">{e.body}</p>

        <div className="mt-8">
          <TrackEntry />
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          {e.noCode}{" "}
          <Link href="/contact" className="text-primary hover:underline">
            {e.contactUs}
          </Link>{" "}
          {e.andHelp}
        </p>
      </div>
    </main>
  )
}
