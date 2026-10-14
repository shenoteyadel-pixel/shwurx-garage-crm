import type React from "react"
import type { Metadata } from "next"
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react"
import { localePath, pick, SITE_URL, siteContext } from "@/lib/website/render"
import { LEGAL_NAME } from "@/lib/website/structured-data"

export const dynamic = "force-dynamic"

const LAST_UPDATED = "14 October 2026"

export async function generateMetadata(): Promise<Metadata> {
  const { doc, lang } = await siteContext()
  const name = pick(doc.business.name, lang) || "SHWURX Auto Service Center"
  return {
    title: `Privacy Policy | ${name}`,
    description: `How ${name} (${LEGAL_NAME}) collects, uses, stores, protects and shares customer information from ads, WhatsApp, website bookings and enquiries.`,
    alternates: { canonical: `${SITE_URL}/privacy-policy` },
  }
}

type Section = { id: string; title: string; body: React.ReactNode }

function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 ps-5 marker:text-primary">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}

export default async function PrivacyPolicyPage() {
  const { doc, lang } = await siteContext()
  const b = doc.business
  const name = pick(b.name, lang) || "SHWURX Auto Service Center"
  const address = pick(b.address, lang)
  const whatsappDigits = b.whatsapp.replace(/\D/g, "")

  const sections: Section[] = [
    {
      id: "who-we-are",
      title: "Who we are",
      body: (
        <p>
          This Privacy Policy explains how {name}, operated by {LEGAL_NAME} in Dubai, United Arab Emirates
          (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;), handles personal information about customers and
          prospective customers. It applies to information we receive through our website, online advertising,
          WhatsApp, phone, email and in person at our workshop, and to the customer management system (CRM) we use
          to serve you.
        </p>
      ),
    },
    {
      id: "what-we-collect",
      title: "Information we collect",
      body: (
        <>
          <p>Depending on how you contact us and which services you use, we may collect:</p>
          <List
            items={[
              <><strong className="text-foreground">Contact details</strong> such as your name, mobile number, email address and preferred language.</>,
              <><strong className="text-foreground">Vehicle details</strong> such as make, model, year, colour, plate number, VIN (chassis number) and mileage.</>,
              <><strong className="text-foreground">Service information</strong> such as the problem you describe, inspection notes, photos and videos of your vehicle, quotations, approvals, job progress, invoices and payment status.</>,
              <><strong className="text-foreground">Messages</strong> you send us on WhatsApp, by email, through website forms or our website assistant, including any photos, documents or voice notes you attach.</>,
              <><strong className="text-foreground">Booking details</strong> such as your preferred appointment date, time and requested service.</>,
              <><strong className="text-foreground">Advertising information</strong> such as which advert, campaign or form you responded to.</>,
              <><strong className="text-foreground">Website usage information</strong> such as pages visited, device and browser type, collected through cookies and similar technologies where you allow it.</>,
            ]}
          />
        </>
      ),
    },
    {
      id: "how-we-collect",
      title: "How we collect it",
      body: (
        <List
          items={[
            <><strong className="text-foreground">Google Ads lead forms.</strong> When you submit a lead form in a Google advert, Google passes the details you entered (for example your name, phone number and email) to us, together with the campaign and form you used.</>,
            <><strong className="text-foreground">Meta Ads (Facebook and Instagram) lead forms.</strong> When you submit an instant form in a Facebook or Instagram advert, Meta passes the details you entered to us, together with the advert and form you used.</>,
            <><strong className="text-foreground">WhatsApp.</strong> When you message our WhatsApp Business number, including after clicking a click-to-WhatsApp advert, we receive your WhatsApp name, phone number, your messages and any media you send, along with information about the advert you clicked where applicable.</>,
            <><strong className="text-foreground">Website bookings and enquiries.</strong> When you book an appointment, send an enquiry or chat with our website assistant, we receive the information you enter.</>,
            <><strong className="text-foreground">Direct contact and visits.</strong> When you call, email or visit our workshop, our team records the information needed to handle your request in our CRM.</>,
          ]}
        />
      ),
    },
    {
      id: "how-we-use",
      title: "How we use your information",
      body: (
        <>
          <p>We use your information to:</p>
          <List
            items={[
              "Respond to your enquiry and follow up on leads you submit to us.",
              "Schedule, confirm and manage appointments.",
              "Inspect, diagnose, repair and maintain your vehicle, and keep a service history.",
              "Prepare quotations, request your approval, share job progress and vehicle photos, and issue invoices and receipts.",
              "Process payments you choose to make online.",
              "Send you service updates and reminders by WhatsApp, SMS, email or phone.",
              "Measure and improve our advertising, website and services.",
              "Keep accurate business, accounting and tax records, and meet our legal obligations.",
              "Protect our customers, staff and business against fraud, misuse and security incidents.",
            ]}
          />
          <p>We do not sell your personal information.</p>
        </>
      ),
    },
    {
      id: "sharing",
      title: "Service providers we share information with",
      body: (
        <>
          <p>
            We use trusted service providers to run our website, CRM and communications. They process information on
            our behalf only to provide their services to us:
          </p>
          <List
            items={[
              <><strong className="text-foreground">Website and application hosting</strong> (Vercel), including secure storage of vehicle photos and documents.</>,
              <><strong className="text-foreground">Database and account services</strong> (Supabase), where our CRM records are stored.</>,
              <><strong className="text-foreground">WhatsApp messaging</strong> through Meta&apos;s WhatsApp Business Platform, provided via our business solution provider 360dialog.</>,
              <><strong className="text-foreground">Advertising platforms</strong> (Google and Meta), which deliver our adverts, provide lead form submissions to us and, where you allow it, measure advert performance.</>,
              <><strong className="text-foreground">Email delivery</strong> (Resend), used to send quotations, invoices and service notifications.</>,
              <><strong className="text-foreground">Online card payments</strong> (Stripe). Card details are entered directly with Stripe and are not stored by us.</>,
              <><strong className="text-foreground">Vehicle data lookup</strong> (CarsXE), used to identify vehicle specifications from a VIN.</>,
              <><strong className="text-foreground">Website assistant</strong>, which uses an artificial intelligence model provided through Vercel to answer your questions.</>,
            ]}
          />
          <p>
            Some of these providers may process information outside the United Arab Emirates. We may also disclose
            information where required by law, by a court or government authority, or to protect our rights, our
            customers or the public.
          </p>
        </>
      ),
    },
    {
      id: "cookies",
      title: "Cookies and analytics",
      body: (
        <p>
          Our website uses essential cookies to function, for example to remember your language and keep forms
          secure. Where analytics or advertising tags (such as Google and Meta tags) are enabled, we ask for your
          consent before they load, and you can change your choice at any time using the privacy choices link in the
          website footer.
        </p>
      ),
    },
    {
      id: "storage-security",
      title: "How we store and protect your information",
      body: (
        <List
          items={[
            "Information is stored in secure, access-controlled cloud systems and transmitted over encrypted connections (HTTPS).",
            "Access to the CRM requires a staff login, and each staff member can only see and do what their role allows.",
            "Links we send you for tracking your vehicle, approving a quotation or paying an invoice are unique and hard to guess.",
            "Messages received from WhatsApp, Google and Meta are verified before being accepted into our CRM.",
            "Important actions in the CRM are recorded in an activity log.",
          ]}
        />
      ),
    },
    {
      id: "retention",
      title: "How long we keep your information",
      body: (
        <p>
          We keep personal information only for as long as it is needed for the purposes described in this policy,
          including providing ongoing service and maintaining your vehicle&apos;s service history, and for as long
          as we are required to keep records under applicable laws, such as accounting and tax requirements. When
          information is no longer needed, we delete it or make it anonymous. You can ask us to delete your
          information at any time, as described below.
        </p>
      ),
    },
    {
      id: "your-rights",
      title: "Your privacy rights",
      body: (
        <>
          <p>Subject to applicable law, you can ask us to:</p>
          <List
            items={[
              "Tell you what personal information we hold about you and provide a copy.",
              "Correct information that is inaccurate or incomplete.",
              "Delete your information, unless we need to keep it to meet a legal obligation or complete a service you requested.",
              "Restrict or object to certain uses of your information.",
              "Stop sending you marketing messages. You can also reply STOP to any marketing message on WhatsApp.",
              "Withdraw any consent you have given, without affecting processing that took place before.",
            ]}
          />
          <p>
            To make a request, contact us using the details below. We may ask you to confirm your identity before
            acting on a request.
          </p>
        </>
      ),
    },
    {
      id: "children",
      title: "Children",
      body: (
        <p>
          Our services are intended for vehicle owners and drivers. We do not knowingly collect personal information
          from children.
        </p>
      ),
    },
    {
      id: "changes",
      title: "Changes to this policy",
      body: (
        <p>
          We may update this Privacy Policy from time to time. The latest version will always be available on this
          page, with the date it was last updated shown at the top.
        </p>
      ),
    },
  ]

  return (
    <article lang="en" dir="ltr" className="mx-auto max-w-6xl px-4 py-14 lg:px-8 lg:py-20">
      <header className="flex flex-col gap-3 border-b border-border pb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">Legal</p>
        <h1 className="text-balance text-4xl font-bold tracking-tight lg:text-5xl">Privacy Policy</h1>
        <p className="max-w-2xl text-pretty leading-relaxed text-muted-foreground">
          How {name} collects, uses, stores, protects and shares your information.
        </p>
        <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
      </header>

      <div className="mt-10 flex flex-col gap-12 lg:flex-row">
        <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:w-60 lg:shrink-0 lg:self-start">
          <h2 className="text-sm font-bold uppercase tracking-wide">On this page</h2>
          <ol className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
            {[...sections, { id: "contact", title: "Contact us" }].map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="transition hover:text-foreground">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex min-w-0 max-w-3xl flex-1 flex-col gap-10">
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="flex scroll-mt-24 flex-col gap-4">
              <h2 className="text-balance text-2xl font-bold tracking-tight">{s.title}</h2>
              <div className="flex flex-col gap-4 text-pretty leading-relaxed text-muted-foreground">{s.body}</div>
            </section>
          ))}

          <section id="contact" className="flex scroll-mt-24 flex-col gap-4 rounded-lg border border-border bg-card p-6">
            <h2 className="text-2xl font-bold tracking-tight">Contact us</h2>
            <p className="leading-relaxed text-muted-foreground">
              For questions about this policy or to exercise your privacy rights, contact {LEGAL_NAME} ({name}):
            </p>
            <ul className="flex flex-col gap-3 text-sm">
              {address && (
                <li className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>{address}</span>
                </li>
              )}
              {b.phone && (
                <li className="flex items-center gap-3">
                  <Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <a href={`tel:${b.phone.replace(/[^\d+]/g, "")}`} className="hover:text-primary" dir="ltr">
                    {b.phone}
                  </a>
                </li>
              )}
              {whatsappDigits && (
                <li className="flex items-center gap-3">
                  <MessageCircle className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <a href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noopener noreferrer" className="hover:text-primary" dir="ltr">
                    WhatsApp {b.whatsapp}
                  </a>
                </li>
              )}
              {b.email && (
                <li className="flex items-center gap-3">
                  <Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <a href={`mailto:${b.email}`} className="hover:text-primary" dir="ltr">
                    {b.email}
                  </a>
                </li>
              )}
            </ul>
            <p className="text-sm text-muted-foreground">
              You can also reach us through our{" "}
              <a href={localePath(lang, "/contact")} className="text-primary underline-offset-4 hover:underline">
                contact page
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </article>
  )
}
