import Image from "next/image"
import { ArrowRight, Link2, Smartphone, Radar } from "lucide-react"
import { TrackLink } from "@/components/site/track-link"
import type { Dict } from "@/lib/i18n/dictionaries"

const STEP_ICONS = [Link2, Smartphone, Radar]

export function TrackShowcase({
  t,
  bookHref,
  bookLabel,
}: {
  t: Dict["home"]["trackShowcase"]
  bookHref: string
  bookLabel: string
}) {
  return (
    <section key="track" className="border-y border-border bg-card/40" aria-labelledby="home-track">
      <div className="mx-auto flex max-w-7xl flex-col gap-12 px-4 py-16 lg:flex-row lg:items-center lg:gap-16 lg:px-8">
        <div className="flex flex-1 flex-col">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">{t.eyebrow}</p>
          <h2 id="home-track" className="mt-4 text-balance text-3xl font-black uppercase leading-[1.02] tracking-tight md:text-4xl">
            {t.title1} <span className="text-primary">{t.title2}</span>
          </h2>
          <p className="mt-5 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">{t.body}</p>

          <ol className="mt-8 flex flex-col gap-4">
            {t.steps.map((step, i) => {
              const Icon = STEP_ICONS[i] ?? Radar
              return (
                <li key={step.title} className="flex gap-4 rounded-xl border border-border bg-background p-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-card">
                    <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold">
                      <span className="text-muted-foreground">{i + 1}. </span>
                      {step.title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                  </div>
                </li>
              )
            })}
          </ol>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <TrackLink
              href="/track"
              label="Track my car — home showcase"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              {t.cta} <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </TrackLink>
            <TrackLink
              href={bookHref}
              label="Book Appointment — track showcase"
              className="inline-flex h-12 items-center justify-center rounded-md border border-border px-6 text-sm font-semibold transition hover:border-primary/60"
            >
              {bookLabel}
            </TrackLink>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{t.note}</p>
        </div>

        <div className="flex flex-1 items-start justify-center gap-4 sm:gap-6">
          <figure className="w-1/2 max-w-64">
            <div className="overflow-hidden rounded-[2rem] border-4 border-border bg-background shadow-2xl">
              <Image
                src="/site/track-status.png"
                alt={t.shot1Alt}
                width={390}
                height={844}
                sizes="(min-width: 1024px) 256px, 45vw"
                className="h-auto w-full"
              />
            </div>
            <figcaption className="mt-3 text-center text-xs text-muted-foreground">{t.shot1Caption}</figcaption>
          </figure>
          <figure className="mt-12 w-1/2 max-w-64">
            <div className="overflow-hidden rounded-[2rem] border-4 border-border bg-background shadow-2xl">
              <Image
                src="/site/track-timeline.png"
                alt={t.shot2Alt}
                width={390}
                height={844}
                sizes="(min-width: 1024px) 256px, 45vw"
                className="h-auto w-full"
              />
            </div>
            <figcaption className="mt-3 text-center text-xs text-muted-foreground">{t.shot2Caption}</figcaption>
          </figure>
        </div>
      </div>
    </section>
  )
}
