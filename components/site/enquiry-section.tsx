import { MapPin, Clock } from "lucide-react"
import { EnquiryForm } from "@/components/site/enquiry-form"
import { ContactActions } from "@/components/site/contact-actions"
import { localePath, pick } from "@/lib/website/render"
import type { Lang, WebsiteDocument } from "@/lib/website/types"

/**
 * Contextual enquiry block: form (prefilled with the page's brand/service),
 * call + WhatsApp, and location. Server component; the form itself is client.
 */
export function EnquirySection({
  doc,
  lang,
  preview,
  formId,
  brandSlug,
  serviceSlug,
}: {
  doc: WebsiteDocument
  lang: Lang
  preview: boolean
  formId: string
  brandSlug?: string | null
  serviceSlug?: string | null
}) {
  const f = doc.forms.enquiry
  const b = doc.business
  const brand = brandSlug ? doc.brands.find((x) => x.slug === brandSlug) : null
  const service = serviceSlug ? doc.services.find((x) => x.slug === serviceSlug) : null
  const waText =
    lang === "ar"
      ? `مرحباً، لدي استفسار${brand ? ` عن ${pick(brand.name, lang)}` : ""}${service ? ` — ${pick(service.name, lang)}` : ""}`
      : `Hello, I have an enquiry${brand ? ` about my ${pick(brand.name, lang)}` : ""}${service ? ` — ${pick(service.name, lang)}` : ""}`

  return (
    <section id="enquire" className="scroll-mt-24 border-t border-border bg-muted/30">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 lg:grid-cols-5 lg:px-8 lg:py-20">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <div>
            <h2 className="text-balance text-2xl font-bold tracking-tight md:text-3xl">
              {lang === "ar" ? "تحدث إلى فريقنا" : "Talk to our team"}
            </h2>
            <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">{pick(f.intro, lang)}</p>
          </div>
          <ContactActions
            phone={b.phone}
            whatsapp={b.whatsapp}
            callLabel={lang === "ar" ? "اتصل" : "Call"}
            whatsappLabel={lang === "ar" ? "واتساب" : "WhatsApp"}
            whatsappText={waText}
            context={formId}
          />
          <div className="flex flex-col gap-3 text-sm text-muted-foreground">
            {pick(b.address, lang) && (
              <p className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  {pick(b.address, lang)}
                  {b.mapUrl && /^https:\/\//.test(b.mapUrl) && (
                    <>
                      {" · "}
                      <a href={b.mapUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-foreground">
                        {lang === "ar" ? "الاتجاهات" : "Directions"}
                      </a>
                    </>
                  )}
                </span>
              </p>
            )}
            {pick(b.hours, lang) && (
              <p className="flex items-start gap-2.5">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{pick(b.hours, lang)}</span>
              </p>
            )}
          </div>
        </div>

        <div className="lg:col-span-3">
          {f.enabled ? (
            <EnquiryForm
              lang={lang}
              formId={formId}
              heading={pick(f.heading, lang)}
              intro=""
              labels={{
                name: pick(f.labels.name, lang),
                phone: pick(f.labels.phone, lang),
                brand: pick(f.labels.brand, lang),
                model: pick(f.labels.model, lang),
                year: pick(f.labels.year, lang),
                service: pick(f.labels.service, lang),
                details: pick(f.labels.details, lang),
                submit: pick(f.labels.submit, lang),
              }}
              privacyNote={pick(f.privacyNote, lang)}
              privacyHref={localePath(lang, "/privacy")}
              successTitle={pick(f.successTitle, lang)}
              successBody={pick(f.successBody, lang)}
              nextSteps={pick(f.nextSteps, lang)}
              brands={doc.brands
                .filter((x) => x.visible)
                .map((x) => ({ slug: x.slug, name: pick(x.name, lang), models: x.models.map((mo) => mo.name), serviceSlugs: x.serviceSlugs }))}
              services={doc.services.filter((x) => x.visible).map((x) => ({ slug: x.slug, name: pick(x.name, lang) }))}
              defaultBrand={brand?.visible ? brand.slug : null}
              defaultService={service?.visible ? service.slug : null}
              preview={preview}
            />
          ) : (
            <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
              {lang === "ar" ? "يرجى الاتصال بنا أو مراسلتنا عبر واتساب." : "Please call or WhatsApp us."}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
