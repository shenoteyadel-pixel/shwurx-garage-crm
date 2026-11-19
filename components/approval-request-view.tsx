"use client"

import * as React from "react"
import { Button, Card, Textarea, Input } from "@/components/ui"
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad"
import { formatCurrency } from "@/lib/utils"
import {
  Check,
  X,
  Car,
  CheckCircle2,
  XCircle,
  Wrench,
  Package,
  ShieldCheck,
  MapPin,
  Clock,
  Lock,
  Languages,
  ChevronDown,
  AlertTriangle,
} from "lucide-react"

type SnapItem = {
  key: string
  kind: "part" | "labor"
  name: string
  part_number: string | null
  detail: string | null
  category: string | null
  recommendation: "required" | "recommended" | "optional"
  quantity: number
  unit_price: number
  labour_hours: number
  labour_rate: number
  discount: number
  lead_time_days?: number | null
  net: number
  vat: number
  gross: number
}

export type PriorApprovedItem = {
  key: string
  name: string
  kind: "part" | "labor"
  net: number
  gross: number
  decided_at: string | null
}

type Data = {
  id: string
  version: number
  kind: "quotation" | "additional_work"
  mode: "per_item" | "whole"
  status: "pending" | "approved" | "rejected" | "partial" | "superseded" | "expired"
  title: string | null
  snapshot: { items: SnapItem[] }
  vat_rate: number
  vat_inclusive: boolean
  subtotal: number
  vat_amount: number
  total: number
  approved_total: number | null
  signer_name: string | null
  decided_at: string | null
  expires_at?: string | null
  sent_at?: string | null
  decisions: Record<string, "approved" | "rejected">
  job: {
    job_number: string
    vehicle_make: string | null
    vehicle_model: string | null
    vehicle_year: number | null
    plate_number: string | null
    mileage?: number | null
    mileage_in?: number | null
  }
  customer: { full_name: string | null; mobile: string | null; email: string | null }
}

type Decision = "approved" | "rejected" | "later"
type Lang = "en" | "ar"
type Priority = SnapItem["recommendation"]

const PRIORITY_ORDER: Priority[] = ["required", "recommended", "optional"]

const PRIORITY_STYLE: Record<Priority, { bar: string; chip: string; dot: string }> = {
  required: { bar: "bg-red-500", chip: "border-red-500/30 bg-red-500/10 text-red-400", dot: "bg-red-500" },
  recommended: { bar: "bg-amber-500", chip: "border-amber-500/30 bg-amber-500/10 text-amber-400", dot: "bg-amber-500" },
  optional: { bar: "bg-emerald-500", chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", dot: "bg-emerald-500" },
}

const T = {
  en: {
    hello: "Hello",
    intro: "Please review the work below. Accept, reject or decide later on each item, then sign to confirm.",
    introExtra: "While working on your vehicle we found additional items that need your approval.",
    extraBadge: "Additional work request",
    validUntil: "Prices valid until",
    validNote: "Parts prices may change after this date due to supplier availability.",
    previouslyApproved: "Already approved",
    approvedOn: "Approved",
    newItems: "Items awaiting your decision",
    nothingNew: "Everything on this quotation is already approved. No new decision is needed.",
    priority: { required: "Critical", recommended: "Recommended", optional: "Optional" } as Record<Priority, string>,
    priorityHint: {
      required: "Safety-related or urgent. We strongly advise doing these now.",
      recommended: "Important repairs that should be done soon.",
      optional: "Preventive maintenance and extras.",
    } as Record<Priority, string>,
    accept: "Accept",
    reject: "Reject",
    later: "Later",
    details: "Details",
    hideDetails: "Hide details",
    acceptAll: "Accept all",
    pricePending: "Price pending",
    pricePendingNote: "We're confirming the price. You can decide once it's confirmed.",
    inStock: "In stock",
    availableIn: (d: number) => (d === 1 ? "Available in 1 day" : `Available in ${d} days`),
    part: "Part",
    labour: "Labour",
    hrs: "hrs",
    qty: "Qty",
    discount: "Discount",
    summary: "Summary",
    subtotal: "Subtotal (excl. VAT)",
    total: "Total (incl. VAT)",
    partsGroup: "Parts",
    labourGroup: "Labour & Services",
    prevTotal: "Previously approved (incl. VAT)",
    selectedNow: "Selected now (excl. VAT)",
    vat: "VAT",
    selectedTotal: "Selected now (incl. VAT)",
    totalApproved: "Total approved",
    alreadyPaid: "Already paid",
    balanceDue: "Balance due",
    unresolved: (n: number) => `${n} item${n === 1 ? "" : "s"} still need a decision`,
    signTitle: "Sign to confirm",
    fullName: "Full name",
    comments: "Comments or questions (optional)",
    commentsPh: "Ask a question or leave instructions for our team...",
    signBelow: "Sign below to authorize your decision",
    clear: "Clear signature",
    terms:
      "I agree to the terms: approved work and ordered parts cannot be cancelled once started; delivery dates depend on parts arrival; additional findings will be sent for separate approval.",
    confirmTotal: (n: number) =>
      `I confirm the total shown in the summary above for the ${n} item${n === 1 ? "" : "s"} I accepted.`,
    submit: "Submit approval",
    submitting: "Submitting...",
    review: "Review & sign",
    signNote: "Your name, signature and time are recorded securely.",
    errChooseAll: "Please accept, reject or choose later for every item.",
    errWhole: "Please choose to approve or decline the quotation.",
    errName: "Please enter your full name to sign.",
    errSign: "Please sign in the box to confirm your decision.",
    errTerms: "Please accept the terms to continue.",
    errTotal: "Please tick the box to confirm the amount.",
    errDecided: "This request has already been answered.",
    errExpired: "This approval link has expired. Please contact the workshop for a new one.",
    errPrice: "One of the items has no confirmed price yet and cannot be accepted.",
    errGeneric: "Something went wrong. Please try again.",
    errNetwork: "Network error. Please try again.",
    approveAll: "Approve all",
    declineAll: "Decline all",
    yourDecision: "Your decision",
    savedForLater: (n: number) => `${n} item${n === 1 ? "" : "s"} saved for later`,
    openSaved: "Review saved items",
    track: "Track your car live",
    resSuperseded: ["This quotation was updated", "A newer version has been sent to you. Please use the latest link from the workshop."],
    resExpired: ["Link expired", "This approval link has expired. Please contact the workshop for an updated quotation."],
    resRejected: ["Quotation declined", "You declined this quotation. Your service advisor will contact you about next steps."],
    resPartial: ["Thank you, response received", "We recorded the items you accepted. Our team will proceed with the accepted work only."],
    resApproved: ["Thank you, approved", "Your approval has been signed. Our team will begin work on your vehicle right away."],
  },
  ar: {
    hello: "مرحباً",
    intro: "يرجى مراجعة الأعمال أدناه. اقبل أو ارفض أو أجّل القرار لكل بند، ثم وقّع للتأكيد.",
    introExtra: "أثناء العمل على سيارتك وجدنا بنوداً إضافية تحتاج إلى موافقتك.",
    extraBadge: "طلب أعمال إضافية",
    validUntil: "الأسعار سارية حتى",
    validNote: "قد تتغير أسعار القطع بعد هذا التاريخ حسب توفرها لدى الموردين.",
    previouslyApproved: "تمت الموافقة مسبقاً",
    approvedOn: "تمت الموافقة",
    newItems: "بنود بانتظار قرارك",
    nothingNew: "جميع بنود عرض السعر معتمدة مسبقاً. لا حاجة لقرار جديد.",
    priority: { required: "حرج", recommended: "موصى به", optional: "اختياري" } as Record<Priority, string>,
    priorityHint: {
      required: "متعلق بالسلامة أو عاجل. ننصح بشدة بإنجازه الآن.",
      recommended: "إصلاحات مهمة يُفضّل إنجازها قريباً.",
      optional: "صيانة وقائية وخدمات إضافية.",
    } as Record<Priority, string>,
    accept: "قبول",
    reject: "رفض",
    later: "لاحقاً",
    details: "التفاصيل",
    hideDetails: "إخفاء التفاصيل",
    acceptAll: "قبول الكل",
    pricePending: "السعر قيد التأكيد",
    pricePendingNote: "نقوم بتأكيد السعر. يمكنك اتخاذ القرار بعد تأكيده.",
    inStock: "متوفر",
    availableIn: (d: number) => (d === 1 ? "متوفر خلال يوم واحد" : `متوفر خلال ${d} أيام`),
    part: "قطعة",
    labour: "أجور العمل",
    hrs: "ساعة",
    qty: "الكمية",
    discount: "خصم",
    summary: "الملخص",
    subtotal: "المجموع (بدون الضريبة)",
    total: "الإجمالي (شامل الضريبة)",
    partsGroup: "قطع الغيار",
    labourGroup: "أجور العمل والخدمات",
    prevTotal: "تمت الموافقة مسبقاً (شامل الضريبة)",
    selectedNow: "المختار الآن (بدون الضريبة)",
    vat: "ضريبة القيمة المضافة",
    selectedTotal: "المختار الآن (شامل الضريبة)",
    totalApproved: "إجمالي الموافق عليه",
    alreadyPaid: "المدفوع",
    balanceDue: "المبلغ المتبقي",
    unresolved: (n: number) => `${n} بند بحاجة إلى قرار`,
    signTitle: "وقّع للتأكيد",
    fullName: "الاسم الكامل",
    comments: "ملاحظات أو أسئلة (اختياري)",
    commentsPh: "اطرح سؤالاً أو اترك تعليمات لفريقنا...",
    signBelow: "وقّع أدناه لاعتماد قرارك",
    clear: "مسح التوقيع",
    terms:
      "أوافق على الشروط: لا يمكن إلغاء الأعمال المعتمدة أو القطع المطلوبة بعد البدء؛ مواعيد التسليم تعتمد على وصول القطع؛ أي أعمال إضافية سترسل لموافقة منفصلة.",
    confirmTotal: (n: number) => `أؤكد الإجمالي الموضح في الملخص أعلاه مقابل ${n} بند قبلته.`,
    submit: "إرسال الموافقة",
    submitting: "جارٍ الإرسال...",
    review: "مراجعة وتوقيع",
    signNote: "يتم تسجيل اسمك وتوقيعك ووقت الموافقة بشكل آمن.",
    errChooseAll: "يرجى القبول أو الرفض أو اختيار لاحقاً لكل بند.",
    errWhole: "يرجى اختيار الموافقة أو الرفض.",
    errName: "يرجى إدخال اسمك الكامل.",
    errSign: "يرجى التوقيع في المربع لتأكيد قرارك.",
    errTerms: "يرجى الموافقة على الشروط للمتابعة.",
    errTotal: "يرجى تأكيد المبلغ.",
    errDecided: "تم الرد على هذا الطلب مسبقاً.",
    errExpired: "انتهت صلاحية هذا الرابط. يرجى التواصل مع الورشة للحصول على رابط جديد.",
    errPrice: "أحد البنود لم يتم تأكيد سعره بعد ولا يمكن قبوله.",
    errGeneric: "حدث خطأ. يرجى المحاولة مرة أخرى.",
    errNetwork: "خطأ في الاتصال. يرجى المحاولة مرة أخرى.",
    approveAll: "الموافقة على الكل",
    declineAll: "رفض الكل",
    yourDecision: "قرارك",
    savedForLater: (n: number) => `تم حفظ ${n} بند لوقت لاحق`,
    openSaved: "مراجعة البنود المحفوظة",
    track: "تتبع سيارتك مباشرة",
    resSuperseded: ["تم تحديث عرض السعر", "تم إرسال نسخة أحدث إليك. يرجى استخدام أحدث رابط من الورشة."],
    resExpired: ["انتهت صلاحية الرابط", "انتهت صلاحية رابط الموافقة. يرجى التواصل مع الورشة."],
    resRejected: ["تم رفض عرض السعر", "لقد رفضت عرض السعر. سيتواصل معك مستشار الخدمة."],
    resPartial: ["شكراً، تم استلام ردك", "سجلنا البنود التي قبلتها. سيقوم فريقنا بتنفيذ الأعمال المقبولة فقط."],
    resApproved: ["شكراً، تمت الموافقة", "تم توقيع موافقتك. سيبدأ فريقنا العمل على سيارتك فوراً."],
  },
}

type Dict = (typeof T)["en"]

function isPricePending(it: SnapItem) {
  return it.kind === "part" && !(Number(it.unit_price) > 0)
}

export function ApprovalRequestView({
  token,
  data,
  trackingPath,
  priorApproved = [],
  alreadyPaid = 0,
  alreadyApprovedKeys = [],
}: {
  token: string
  data: Data
  trackingPath?: string | null
  priorApproved?: PriorApprovedItem[]
  alreadyPaid?: number
  alreadyApprovedKeys?: string[]
}) {
  const items = React.useMemo(() => {
    const skip = new Set(alreadyApprovedKeys)
    return (data.snapshot?.items ?? []).filter((i) => !skip.has(i.key))
  }, [data.snapshot?.items, alreadyApprovedKeys])
  const isWhole = data.mode === "whole"
  const [lang, setLang] = React.useState<Lang>("en")
  const t = T[lang] as Dict

  const [decisions, setDecisions] = React.useState<Record<string, Decision | undefined>>({})
  const [wholeDecision, setWholeDecision] = React.useState<"approved" | "rejected" | null>(null)
  const [signerName, setSignerName] = React.useState(data.customer?.full_name ?? "")
  const [comment, setComment] = React.useState("")
  const [termsAccepted, setTermsAccepted] = React.useState(false)
  const [confirmedTotal, setConfirmedTotal] = React.useState<number | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<null | { status: string; followUpToken?: string | null; deferredCount?: number }>(null)
  const sigRef = React.useRef<SignaturePadHandle>(null)
  const signRef = React.useRef<HTMLDivElement>(null)

  const vehicle =
    [data.job.vehicle_year, data.job.vehicle_make, data.job.vehicle_model].filter(Boolean).join(" ") || "Your vehicle"
  const mileage = data.job.mileage ?? data.job.mileage_in

  const acceptedItems = isWhole
    ? wholeDecision === "approved"
      ? items
      : []
    : items.filter((i) => decisions[i.key] === "approved")
  const approvedNet = acceptedItems.reduce((s, i) => s + i.net, 0)
  const approvedVat = approvedNet * (data.vat_rate / 100)
  const approvedTotal = approvedNet + approvedVat
  const roundedTotal = Math.round(approvedTotal * 100) / 100
  const approvedCount = acceptedItems.length
  const unresolved = isWhole ? (wholeDecision ? 0 : 1) : items.filter((i) => !decisions[i.key]).length

  const priorTotal = priorApproved.reduce((s, i) => s + i.gross, 0)
  const grandApproved = priorTotal + roundedTotal
  const balanceDue = Math.max(0, grandApproved - alreadyPaid)
  const totalConfirmed = confirmedTotal !== null && confirmedTotal === roundedTotal

  const grouped = React.useMemo(() => {
    const map = new Map<string, SnapItem[]>()
    for (const it of items) {
      const cat = it.category?.trim() || (it.kind === "part" ? t.partsGroup : t.labourGroup)
      const list = map.get(cat) ?? []
      list.push(it)
      map.set(cat, list)
    }
    return Array.from(map.entries()).map(([category, list]) => ({ category, items: list }))
  }, [items, t])

  const expiresAt = data.expires_at ? new Date(data.expires_at) : null
  const locale = lang === "ar" ? "ar-AE" : "en-AE"

  function setItem(key: string, d: Decision) {
    setDecisions((prev) => ({ ...prev, [key]: d }))
    setError(null)
  }

  function acceptAll() {
    setDecisions((prev) => {
      const next = { ...prev }
      for (const it of items) if (!isPricePending(it)) next[it.key] = "approved"
      return next
    })
  }

  async function submit() {
    setError(null)
    if (isWhole && !wholeDecision) return setError(t.errWhole)
    if (!isWhole && unresolved > 0) return setError(t.errChooseAll)
    if (!signerName.trim()) return setError(t.errName)
    if (!sigRef.current || sigRef.current.isEmpty()) return setError(t.errSign)
    if (!termsAccepted) return setError(t.errTerms)
    if (approvedCount > 0 && !totalConfirmed) return setError(t.errTotal)

    const payload: Record<string, string | null> = isWhole ? { __whole__: wholeDecision } : {}
    const deferred: string[] = []
    if (!isWhole) {
      for (const it of items) {
        const d = decisions[it.key]
        if (d === "later") deferred.push(it.key)
        else if (d) payload[it.key] = d
      }
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/approvals/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          decisions: payload,
          deferred,
          signerName: signerName.trim(),
          signature: sigRef.current?.toDataURL(),
          comment,
          confirmedTotal: approvedCount > 0 ? roundedTotal : null,
        }),
      })
      const json = await res.json()
      if (json.ok) setDone({ status: json.status, followUpToken: json.followUpToken, deferredCount: json.deferredCount })
      else if (json.error === "already_decided") setError(t.errDecided)
      else if (json.error === "expired") setError(t.errExpired)
      else if (json.error === "price_pending") setError(t.errPrice)
      else setError(t.errGeneric)
    } catch {
      setError(t.errNetwork)
    } finally {
      setSubmitting(false)
    }
  }

  const langToggle = (
    <button
      type="button"
      onClick={() => setLang(lang === "en" ? "ar" : "en")}
      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <Languages className="h-3.5 w-3.5" aria-hidden="true" />
      {lang === "en" ? "العربية" : "English"}
    </button>
  )

  if (done || data.status !== "pending") {
    const finalStatus = done?.status ?? data.status
    const [title, text] =
      finalStatus === "superseded"
        ? t.resSuperseded
        : finalStatus === "expired"
          ? t.resExpired
          : finalStatus === "rejected"
            ? t.resRejected
            : finalStatus === "partial"
              ? t.resPartial
              : t.resApproved
    const ok = finalStatus === "approved" || finalStatus === "partial"
    return (
      <div dir={lang === "ar" ? "rtl" : "ltr"} className="flex flex-col gap-4">
        <div className="flex justify-end">{langToggle}</div>
        <Card className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
            {ok ? <CheckCircle2 className="h-8 w-8 text-emerald-400" /> : <XCircle className="h-8 w-8 text-red-400" />}
          </div>
          <h1 className="text-balance text-xl font-bold">{title}</h1>
          <p className="mx-auto mt-2 max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">{text}</p>
          {done?.followUpToken && (
            <div className="mx-auto mt-5 flex max-w-sm flex-col items-center gap-2 rounded-lg border border-border p-4">
              <p className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-amber-400" aria-hidden="true" />
                {t.savedForLater(done.deferredCount ?? 0)}
              </p>
              <a href={`/approve/r/${done.followUpToken}`} className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
                {t.openSaved}
              </a>
            </div>
          )}
          {trackingPath && ok && (
            <a
              href={trackingPath}
              className="mx-auto mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <MapPin className="h-4 w-4" aria-hidden="true" />
              {t.track}
            </a>
          )}
        </Card>
      </div>
    )
  }

  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"} className="flex flex-col gap-5">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary">
              <Car className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-balance text-lg font-bold">{vehicle}</h1>
              <p className="text-xs text-muted-foreground">
                {data.job.job_number}
                {data.job.plate_number ? ` · ${data.job.plate_number}` : ""}
                {mileage ? ` · ${Number(mileage).toLocaleString()} km` : ""}
                {data.version > 1 ? ` · v${data.version}` : ""}
              </p>
            </div>
          </div>
          {langToggle}
        </div>
        <p className="mt-4 text-pretty text-sm leading-relaxed text-muted-foreground">
          {t.hello} {(data.customer?.full_name ?? "").split(" ")[0]}, {data.kind === "additional_work" ? `${t.introExtra} ` : ""}
          {t.intro}
        </p>
        {data.kind === "additional_work" && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
            <Wrench className="h-3.5 w-3.5" aria-hidden="true" /> {t.extraBadge}
          </div>
        )}
        {expiresAt && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-secondary/40 p-3 text-xs leading-relaxed">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
            <span>
              <strong>
                {t.validUntil} {expiresAt.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}.
              </strong>{" "}
              {t.validNote}
            </span>
          </div>
        )}
      </Card>

      {priorApproved.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Lock className="h-4 w-4" aria-hidden="true" /> {t.previouslyApproved}
          </h2>
          <ul className="flex flex-col divide-y divide-border">
            {priorApproved.map((it) => (
              <li key={it.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{it.name}</div>
                  {it.decided_at && (
                    <div className="text-xs text-muted-foreground">
                      {t.approvedOn} {new Date(it.decided_at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums">{formatCurrency(it.net)}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                    <Check className="h-3 w-3" aria-hidden="true" />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!isWhole && items.length === 0 && (
        <Card className="p-5 text-sm text-muted-foreground">{t.nothingNew}</Card>
      )}

      {!isWhole && items.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t.newItems}</h2>
          <Button variant="outline" size="sm" onClick={acceptAll}>
            <Check className="h-4 w-4" aria-hidden="true" /> {t.acceptAll}
          </Button>
        </div>
      )}

      {grouped.map((group) => (
        <section key={group.category} className="flex flex-col gap-3">
          <div className="border-b border-border pb-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide">{group.category}</h3>
          </div>
          {group.items.map((it) => (
            <ItemCard
              key={it.key}
              it={it}
              t={t}
              decision={isWhole ? undefined : decisions[it.key]}
              disabled={isWhole}
              onDecision={(d) => setItem(it.key, d)}
            />
          ))}
        </section>
      ))}

      {isWhole && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t.yourDecision}</h2>
          <div className="flex gap-2">
            <Button onClick={() => setWholeDecision("approved")} variant={wholeDecision === "approved" ? "success" : "outline"} className="flex-1">
              <Check className="h-4 w-4" aria-hidden="true" /> {t.approveAll}
            </Button>
            <Button onClick={() => setWholeDecision("rejected")} variant={wholeDecision === "rejected" ? "danger" : "outline"} className="flex-1">
              <X className="h-4 w-4" aria-hidden="true" /> {t.declineAll}
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t.summary}</h2>
        <div className="flex flex-col gap-1.5 text-sm">
          <Row label={t.subtotal} value={formatCurrency(approvedNet)} />
          <Row label={`${t.vat} (${data.vat_rate}%)`} value={formatCurrency(approvedVat)} />
          <div
            className={`mt-1 flex items-center justify-between border-t border-border pt-2 ${
              priorTotal > 0 || alreadyPaid > 0 ? "font-semibold" : "text-lg font-bold"
            }`}
          >
            <span>{t.total}</span>
            <span className={`tabular-nums ${priorTotal > 0 || alreadyPaid > 0 ? "" : "text-primary"}`}>
              {formatCurrency(roundedTotal)}
            </span>
          </div>
          {(priorTotal > 0 || alreadyPaid > 0) && (
            <>
              {priorTotal > 0 && <Row label={t.prevTotal} value={`+ ${formatCurrency(priorTotal)}`} />}
              {alreadyPaid > 0 && <Row label={t.alreadyPaid} value={`- ${formatCurrency(alreadyPaid)}`} />}
              <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-lg font-bold">
                <span>{t.balanceDue}</span>
                <span className="tabular-nums text-primary">{formatCurrency(balanceDue)}</span>
              </div>
            </>
          )}
          {!isWhole && unresolved > 0 && <p className="pt-1 text-xs text-amber-400">{t.unresolved(unresolved)}</p>}
        </div>
      </Card>

      <div ref={signRef} className="scroll-mt-6">
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> {t.signTitle}
          </h2>

          <label htmlFor="signer-name" className="mb-1.5 block text-xs font-medium text-muted-foreground">
            {t.fullName}
          </label>
          <Input id="signer-name" value={signerName} onChange={(e) => setSignerName(e.target.value)} className="mb-3" />

          <label htmlFor="signer-comment" className="mb-1.5 block text-xs font-medium text-muted-foreground">
            {t.comments}
          </label>
          <Textarea id="signer-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t.commentsPh} />

          <div className="mt-4">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{t.signBelow}</span>
            <div dir="ltr" className="overflow-hidden rounded-lg border border-border bg-white">
              <SignaturePad ref={sigRef} className="h-40 w-full" />
            </div>
            <button type="button" onClick={() => sigRef.current?.clear()} className="mt-2 text-xs text-muted-foreground hover:text-foreground">
              {t.clear}
            </button>
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm leading-relaxed">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
            <span>{t.terms}</span>
          </label>

          {approvedCount > 0 && (
            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm leading-relaxed">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-primary"
                checked={totalConfirmed}
                onChange={(e) => setConfirmedTotal(e.target.checked ? roundedTotal : null)}
              />
              <span>{t.confirmTotal(approvedCount)}</span>
            </label>
          )}

          {error && (
            <p role="alert" className="mt-3 text-sm text-red-400">
              {error}
            </p>
          )}

          <Button onClick={submit} disabled={submitting} className="mt-5 w-full" size="lg">
            <Check className="h-4 w-4" aria-hidden="true" /> {submitting ? t.submitting : t.submit}
          </Button>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">{t.signNote}</p>
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="text-xs leading-snug text-muted-foreground">
            {unresolved > 0 && !isWhole ? t.unresolved(unresolved) : `${approvedCount} / ${items.length}`}
          </div>
          <Button size="lg" onClick={() => signRef.current?.scrollIntoView({ behavior: "smooth" })}>
            {t.review}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ItemCard({
  it,
  t,
  decision,
  disabled,
  onDecision,
}: {
  it: SnapItem
  t: Dict
  decision: Decision | undefined
  disabled: boolean
  onDecision: (d: Decision) => void
}) {
  const [open, setOpen] = React.useState(false)
  const pending = isPricePending(it)
  const style = PRIORITY_STYLE[it.recommendation] ?? PRIORITY_STYLE.required
  const lead = it.lead_time_days
  const hasDetails = Boolean(it.detail) || it.discount > 0 || Boolean(it.part_number)

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-border bg-card transition-opacity ${
        decision === "rejected" ? "opacity-60" : ""
      }`}
    >
      <span className={`absolute inset-y-0 start-0 w-1 ${style.bar}`} aria-hidden="true" />
      <div className="flex flex-col gap-3 p-4 ps-5 md:flex-row md:items-center md:gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {it.kind === "part" ? (
              <Package className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : (
              <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <span className="text-[15px] font-medium leading-snug">{it.name}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${style.chip}`}>{t.priority[it.recommendation]}</span>
            {it.kind === "part" ? (
              it.quantity > 1 && (
                <span>
                  {t.qty} {it.quantity}
                </span>
              )
            ) : (
              <span>
                {t.labour}
                {it.labour_hours > 0 ? ` · ${it.labour_hours} ${t.hrs}` : ""}
              </span>
            )}
            {it.kind === "part" && !pending && lead != null && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {lead > 0 ? t.availableIn(lead) : t.inStock}
              </span>
            )}
            {hasDetails && (
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="inline-flex items-center gap-0.5 font-medium text-foreground/80 hover:text-foreground"
              >
                {open ? t.hideDetails : t.details}
                <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
            )}
          </div>
          {open && (
            <div className="mt-2 flex flex-col gap-1 text-sm leading-relaxed text-muted-foreground">
              {it.part_number && <span className="font-mono text-xs uppercase">#{it.part_number}</span>}
              {it.detail && <p className="whitespace-pre-wrap">{it.detail}</p>}
              {it.discount > 0 && (
                <span className="text-xs text-emerald-400">
                  {t.discount} - {formatCurrency(it.discount)}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 md:w-56 md:shrink-0 md:justify-end">
          {pending ? (
            <span className="rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-400">{t.pricePending}</span>
          ) : (
            <span className="font-semibold tabular-nums">{formatCurrency(it.net)}</span>
          )}
        </div>
      </div>

      {pending && <p className="px-5 pb-2 text-xs text-muted-foreground">{t.pricePendingNote}</p>}

      {!disabled && (
        <div className="grid grid-cols-3 gap-2 border-t border-border p-3 ps-5">
          <DecisionButton
            active={decision === "approved"}
            disabled={pending}
            onClick={() => onDecision("approved")}
            activeClass="border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
            icon={<Check className="h-4 w-4" aria-hidden="true" />}
            label={t.accept}
          />
          <DecisionButton
            active={decision === "rejected"}
            onClick={() => onDecision("rejected")}
            activeClass="border-red-500/50 bg-red-500/15 text-red-400"
            icon={<X className="h-4 w-4" aria-hidden="true" />}
            label={t.reject}
          />
          <DecisionButton
            active={decision === "later"}
            onClick={() => onDecision("later")}
            activeClass="border-amber-500/50 bg-amber-500/15 text-amber-400"
            icon={<Clock className="h-4 w-4" aria-hidden="true" />}
            label={t.later}
          />
        </div>
      )}
    </div>
  )
}

function DecisionButton({
  active,
  disabled,
  onClick,
  activeClass,
  icon,
  label,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  activeClass: string
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex h-11 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? activeClass : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  )
}
