import type { Metadata } from "next"
import { Phone, Mail, MapPin, MessageCircle } from "lucide-react"
import { ContactForm } from "@/components/site/contact-form"
import { getPublicSiteInfo } from "@/lib/site-info"

export const metadata: Metadata = {
  title: "Contact — SHWURX Auto Service Center",
  description: "Get in touch with SHWURX Auto Service Center. Call, email, or message us on WhatsApp.",
}

export default async function ContactPage() {
  const info = await getPublicSiteInfo()
  const waNumber = (info.whatsapp || "").replace(/[^\d]/g, "")

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
      <div className="max-w-2xl">
        <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl">Get in touch</h1>
        <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">
          Have a question or want to speak to an advisor? Send us a message and we&apos;ll reply quickly — or
          reach us directly using the details below.
        </p>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <div className="flex flex-col gap-4">
          {info.phone && (
            <a
              href={`tel:${info.phone.replace(/\s+/g, "")}`}
              className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition hover:border-primary/50"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                <Phone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Call us</p>
                <p className="text-sm font-semibold">{info.phone}</p>
              </div>
            </a>
          )}

          {waNumber && (
            <a
              href={`https://wa.me/${waNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition hover:border-primary/50"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10">
                <MessageCircle className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">WhatsApp</p>
                <p className="text-sm font-semibold">Message us</p>
              </div>
            </a>
          )}

          {info.email && (
            <a
              href={`mailto:${info.email}`}
              className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition hover:border-primary/50"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm font-semibold">{info.email}</p>
              </div>
            </a>
          )}

          {info.address && (
            <div className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Visit us</p>
                <p className="text-sm font-semibold leading-relaxed">{info.address}</p>
              </div>
            </div>
          )}
        </div>

        <ContactForm />
      </div>
    </div>
  )
}
