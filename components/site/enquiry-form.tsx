"use client"

import Link from "next/link"
import { useId, useRef, useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { emitConversion, getAttribution, track } from "@/lib/site-track"
import { buildEnquiryPayload } from "@/lib/website/intake-context"
import { servicesForBrand, validateVehicleYear } from "@/lib/website/intake-validate"

export interface EnquiryFormProps {
  lang: "en" | "ar"
  formId: string
  heading: string
  intro: string
  labels: { name: string; phone: string; brand: string; model: string; year: string; service: string; details: string; submit: string }
  privacyNote: string
  privacyHref: string
  successTitle: string
  successBody: string
  nextSteps: string
  brands: { slug: string; name: string; models: string[]; serviceSlugs: string[] }[]
  services: { slug: string; name: string }[]
  defaultBrand?: string | null
  defaultService?: string | null
  /** editor preview: never submits */
  preview?: boolean
}

const MSG = {
  en: {
    required: "Please fill in this field.",
    phone: "Enter a phone number with at least 7 digits.",
    year: "Enter a model year from 2016 onwards.",
    details: "Tell us the model, the service or the problem.",
    generic: "We could not send your enquiry. Please try again, or call or WhatsApp us.",
    tooFast: "Please take a moment to check your details, then send again.",
    rate: "We already received several enquiries from this number. We will contact you shortly.",
    preview: "Preview mode — enquiries are not sent.",
    dryRun: "Test only: the details passed validation but nothing was sent or saved, and no one will contact you from this preview.",
    optional: "optional",
    other: "Other / not sure",
    sending: "Sending…",
    errorSummary: "Please correct the highlighted fields.",
  },
  ar: {
    required: "يرجى تعبئة هذا الحقل.",
    phone: "أدخل رقم هاتف لا يقل عن 7 أرقام.",
    year: "أدخل سنة الطراز من 2016 فما بعد.",
    details: "أخبرنا بالموديل أو الخدمة أو المشكلة.",
    generic: "تعذّر إرسال استفسارك. يرجى المحاولة مرة أخرى أو الاتصال بنا أو مراسلتنا عبر واتساب.",
    tooFast: "يرجى مراجعة بياناتك ثم الإرسال مرة أخرى.",
    rate: "استلمنا عدة استفسارات من هذا الرقم، وسنتواصل معك قريباً.",
    preview: "وضع المعاينة — لا يتم إرسال الاستفسارات.",
    dryRun: "اختبار فقط: اجتازت البيانات التحقق لكن لم يُرسل أو يُحفظ شيء، ولن يتواصل معك أحد من هذه المعاينة.",
    optional: "اختياري",
    other: "أخرى / غير متأكد",
    sending: "جارٍ الإرسال…",
    errorSummary: "يرجى تصحيح الحقول المحددة.",
  },
}

type Field = "name" | "phone" | "year" | "details"

function newSubmissionId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16),
      )
}

export function EnquiryForm(p: EnquiryFormProps) {
  const m = MSG[p.lang]
  const uid = useId()
  const startedAt = useRef<number>(Date.now())
  // Stable across retries of the SAME enquiry so the server can deduplicate.
  const submissionId = useRef<string>(newSubmissionId())
  const started = useRef(false)

  const [brand, setBrand] = useState(p.defaultBrand ?? "")
  const [service, setService] = useState(() => {
    const db = p.brands.find((b) => b.slug === p.defaultBrand)
    const ds = p.defaultService ?? ""
    return ds && db && !db.serviceSlugs.includes(ds) ? "" : ds
  })
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle")
  const [notice, setNotice] = useState<string | null>(null)

  const selectedBrand = p.brands.find((b) => b.slug === brand)
  const models = selectedBrand?.models ?? []
  const serviceOptions = servicesForBrand(p.services, selectedBrand)

  function onBrandChange(next: string) {
    setBrand(next)
    const nb = p.brands.find((b) => b.slug === next)
    // A service the newly chosen brand does not offer would be rejected by the server.
    if (service && nb && !nb.serviceSlugs.includes(service)) setService("")
  }
  const id = (f: string) => `${uid}-${f}`

  function onFirstInput() {
    if (started.current) return
    started.current = true
    track("form_start", { form: p.formId, brand: brand || null, service: service || null })
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (status === "sending") return
    const fd = new FormData(e.currentTarget)
    const v = (k: string) => String(fd.get(k) ?? "").trim()
    const next: Partial<Record<Field, string>> = {}
    if (v("name").length < 2) next.name = m.required
    if (v("phone").replace(/\D/g, "").length < 7) next.phone = m.phone
    if (!validateVehicleYear(v("year")).ok) next.year = m.year
    if (!v("model") && !v("details") && !service) next.details = m.details
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length) {
      setFormError(m.errorSummary)
      const first = Object.keys(next)[0]
      document.getElementById(id(first))?.focus()
      return
    }
    if (p.preview) {
      setNotice(m.preview)
      return
    }

    setStatus("sending")
    try {
      const res = await fetch("/api/public/enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildEnquiryPayload({
            submissionId: submissionId.current,
            startedAt: startedAt.current,
            honeypot: v("website"),
            context: p.formId,
            lang: p.lang,
            name: v("name"),
            phone: v("phone"),
            brand: brand || null,
            model: v("model"),
            year: v("year"),
            service: service || null,
            details: v("details"),
            submitPath: window.location.pathname,
            attribution: getAttribution(),
          }),
        ),
      })
      const json = (await res.json().catch(() => ({}))) as {
        outcome?: string
        id?: string | null
        fields?: Record<string, string>
      }
      // Inputs are uncontrolled and stay in the DOM on every failure path.
      if (json.outcome === "dry_run") {
        setStatus("idle")
        setNotice(m.dryRun)
        return
      }
      if ((json.outcome === "received" || json.outcome === "duplicate") && json.id) {
        setStatus("done")
        // "duplicate" means an earlier attempt persisted but its response was lost;
        // emitConversion is keyed by the durable lead id, so it still counts once.
        emitConversion(json.id, { form: p.formId, brand: brand || null, service: service || null })
        return
      }
      setStatus("idle")
      if (json.outcome === "invalid" && json.fields) {
        if (json.fields.form === "too_fast") {
          setFormError(m.tooFast)
          return
        }
        const f: Partial<Record<Field, string>> = {}
        if (json.fields.name) f.name = m.required
        if (json.fields.phone) f.phone = m.phone
        if (json.fields.year) f.year = m.year
        if (json.fields.details || json.fields.service || json.fields.brand || json.fields.form) f.details = m.details
        setErrors(f)
        setFormError(m.errorSummary)
      } else if (json.outcome === "rate_limited") setFormError(m.rate)
      else setFormError(m.generic)
    } catch {
      setStatus("idle")
      setFormError(m.generic)
    }
  }

  if (status === "done") {
    return (
      <div role="status" className="rounded-2xl border border-border bg-card p-6 md:p-8">
        <CheckCircle2 className="h-8 w-8 text-primary" aria-hidden="true" />
        <h3 className="mt-4 text-xl font-semibold">{p.successTitle}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.successBody}</p>
        <p className="mt-4 text-sm leading-relaxed">{p.nextSteps}</p>
        {notice && <p className="mt-4 rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground">{notice}</p>}
      </div>
    )
  }

  const input =
    "h-12 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive"
  const label = "text-sm font-medium"
  const err = (f: Field) =>
    errors[f] ? (
      <p id={id(`${f}-err`)} className="text-sm text-destructive">
        {errors[f]}
      </p>
    ) : null
  const aria = (f: Field) => ({
    "aria-invalid": errors[f] ? true : undefined,
    "aria-describedby": errors[f] ? id(`${f}-err`) : undefined,
  })

  return (
    <form
      onSubmit={onSubmit}
      onInput={onFirstInput}
      noValidate
      className="rounded-2xl border border-border bg-card p-5 md:p-8"
      aria-labelledby={id("h")}
    >
      <h2 id={id("h")} className="text-xl font-semibold md:text-2xl">
        {p.heading}
      </h2>
      {p.intro && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.intro}</p>}

      {formError && (
        <p role="alert" className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}
      {notice && <p className="mt-4 rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground">{notice}</p>}

      {/* Honeypot: hidden from people and assistive tech */}
      <div aria-hidden="true" className="absolute -start-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("name")} className={label}>
            {p.labels.name}
          </label>
          <input id={id("name")} name="name" autoComplete="name" maxLength={80} className={input} {...aria("name")} />
          {err("name")}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("phone")} className={label}>
            {p.labels.phone}
          </label>
          <input
            id={id("phone")}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            maxLength={24}
            placeholder="+971 5X XXX XXXX"
            className={`${input} text-start`}
            {...aria("phone")}
          />
          {err("phone")}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("brand")} className={label}>
            {p.labels.brand}
          </label>
          <select id={id("brand")} value={brand} onChange={(e) => onBrandChange(e.target.value)} className={input}>
            <option value="">{m.other}</option>
            {p.brands.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("service")} className={label}>
            {p.labels.service}
          </label>
          <select id={id("service")} value={service} onChange={(e) => setService(e.target.value)} className={input}>
            <option value="">{m.other}</option>
            {serviceOptions.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("model")} className={label}>
            {p.labels.model}
          </label>
          <input id={id("model")} name="model" list={id("models")} maxLength={60} dir="auto" className={input} />
          <datalist id={id("models")}>
            {models.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("year")} className={label}>
            {p.labels.year} <span className="font-normal text-muted-foreground">({m.optional})</span>
          </label>
          <input
            id={id("year")}
            name="year"
            inputMode="numeric"
            maxLength={4}
            dir="ltr"
            placeholder="2019"
            className={`${input} text-start`}
            {...aria("year")}
          />
          {err("year")}
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={id("details")} className={label}>
            {p.labels.details} <span className="font-normal text-muted-foreground">({m.optional})</span>
          </label>
          <textarea
            id={id("details")}
            name="details"
            rows={3}
            maxLength={1000}
            dir="auto"
            className={`${input} h-auto py-2`}
            {...aria("details")}
          />
          {err("details")}
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        {p.privacyNote}{" "}
        <Link href={p.privacyHref} className="underline underline-offset-4 hover:text-foreground">
          {p.lang === "ar" ? "سياسة الخصوصية" : "Privacy policy"}
        </Link>
      </p>

      <button
        type="submit"
        disabled={status === "sending"}
        className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60 sm:w-auto"
      >
        {status === "sending" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {status === "sending" ? m.sending : p.labels.submit}
      </button>
    </form>
  )
}
