import { getDictionary, type Dict } from "@/lib/i18n/dictionaries"
import type { L10n, SeoFields, WebsiteDocument } from "./types"

export const APPOINTMENT_TYPES = ["dropoff", "pickup", "pickup_delivery"] as const
export type AppointmentType = typeof APPOINTMENT_TYPES[number]
export interface AppointmentPageConfig {
  visible: boolean
  badge: L10n
  title: L10n
  body: L10n
  points: L10n[]
  preferToCall: L10n
  disabledMessage: L10n
  contactLabel: L10n
  seo: SeoFields
}
export interface AppointmentFormConfig {
  enabled: boolean
  copy: { en: Dict["appointmentForm"]; ar: Dict["appointmentForm"] }
  modes: Record<AppointmentType, boolean>
  /** An empty selection offers no named services; Other is controlled separately. */
  serviceSlugs: string[]
  allowOther: boolean
  optionalFields: { email: boolean; plate: boolean; notes: boolean }
}

function knownCopy<T>(base: T, raw: unknown): T {
  if (typeof base === "string") return (typeof raw === "string" ? raw : base) as T
  if (Array.isArray(base)) return (Array.isArray(raw) ? raw.filter((v) => typeof v === "string") : [...base]) as T
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  return Object.fromEntries(Object.entries(base as object).map(([k, v]) => [k, knownCopy(v, value[k])])) as T
}
export function appointmentDefaults(strings: { en?: Record<string, unknown>; ar?: Record<string, unknown> } = {}) {
  const en = {
    appointmentPage: knownCopy(getDictionary("en").appointmentPage, strings.en?.appointmentPage),
    appointmentForm: knownCopy(getDictionary("en").appointmentForm, strings.en?.appointmentForm),
  }
  const ar = {
    appointmentPage: knownCopy(getDictionary("ar").appointmentPage, strings.ar?.appointmentPage),
    appointmentForm: knownCopy(getDictionary("ar").appointmentForm, strings.ar?.appointmentForm),
  }
  const pair = (a: string, b: string): L10n => ({ en: a, ar: b })
  const page: AppointmentPageConfig = {
    visible: true,
    badge: pair(en.appointmentPage.badge, ar.appointmentPage.badge),
    title: pair(en.appointmentPage.title, ar.appointmentPage.title),
    body: pair(en.appointmentPage.body, ar.appointmentPage.body),
    points: Array.from({ length: Math.max(en.appointmentPage.points.length, ar.appointmentPage.points.length) },
      (_, i) => pair(en.appointmentPage.points[i] ?? "", ar.appointmentPage.points[i] ?? "")),
    preferToCall: pair(en.appointmentPage.preferToCall, ar.appointmentPage.preferToCall),
    disabledMessage: pair("Online appointment requests are currently unavailable. Please contact us to arrange a visit.", "طلبات المواعيد عبر الموقع غير متاحة حالياً. تواصل معنا لترتيب الزيارة."),
    contactLabel: pair("Contact us", "تواصل معنا"),
    seo: {
      title: pair("Request an appointment", "طلب موعد"),
      description: pair("Request a vehicle service appointment. Our team will contact you to confirm the details.", "اطلب موعداً لخدمة سيارتك. سيتواصل معك فريقنا لتأكيد التفاصيل."),
      ogImageId: null, noindex: false,
    },
  }
  const form: AppointmentFormConfig = {
    enabled: true,
    copy: structuredClone({ en: en.appointmentForm, ar: ar.appointmentForm }),
    modes: { dropoff: true, pickup: true, pickup_delivery: true },
    serviceSlugs: ["mechanical-repair", "diagnostics", "bodywork", "painting", "online-programming", "offline-programming"],
    allowOther: true,
    optionalFields: { email: true, plate: true, notes: true },
  }
  return { page, form }
}

export function appointmentServices(doc: WebsiteDocument) {
  return doc.services.filter((s) => s.visible && doc.forms.appointment.serviceSlugs.includes(s.slug))
}
export function appointmentAvailable(doc: WebsiteDocument) {
  return doc.pages.appointment.visible && doc.forms.appointment.enabled && APPOINTMENT_TYPES.some((t) => doc.forms.appointment.modes[t])
}
export function isAppointmentPath(path: string) {
  return /^\/(?:ar\/)?appointment(?:[/?#]|$)/.test(path)
}
/** Public restrictions only. The CRM's booking payload and business rules remain unchanged. */
export function appointmentRequestIssue(doc: WebsiteDocument, body: Record<string, unknown>): string | null {
  if (!appointmentAvailable(doc)) return "booking_unavailable"
  const metadata = body.metadata as { logistics?: { type?: unknown } } | undefined
  const mode = metadata?.logistics?.type ?? "dropoff"
  if (!APPOINTMENT_TYPES.includes(mode as AppointmentType) || !doc.forms.appointment.modes[mode as AppointmentType]) return "booking_type_unavailable"
  const service = body.serviceInterest ?? body.service_interest
  if (service != null && service !== "" &&
      !(service === "Other" && doc.forms.appointment.allowOther) &&
      !appointmentServices(doc).some((s) => s.name.en === service)) return "service_unavailable"
  return null
}
