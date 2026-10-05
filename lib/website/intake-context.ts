import type { Brand, Lang, Service, WebsiteDocument } from "./types"

/**
 * A website enquiry carries two different identifiers:
 *  - `formKey`: the CONFIGURED form (a key of `doc.forms`, today only "enquiry")
 *  - `context`: the PAGE the form sits on ("contact", "brand-<slug>",
 *    "service-<slug>", "page-<slug>"). It is validated against the real
 *    published page, never trusted as a free label.
 */
export type EnquiryContext =
  | { kind: "general"; id: "enquiry" | "home" | "contact" }
  | { kind: "brand"; id: string; brand: Brand }
  | { kind: "service"; id: string; service: Service }
  | { kind: "page"; id: string; pageSlug: string }

export interface EnquiryPayloadInput {
  submissionId: string
  startedAt: number
  honeypot: string
  context: string
  lang: Lang
  name: string
  phone: string
  brand: string | null
  model: string
  year: string
  service: string | null
  details: string
  submitPath: string
  attribution: unknown
}

/** The ONE request shape every website enquiry caller sends (UI and tests share it). */
export function buildEnquiryPayload(i: EnquiryPayloadInput) {
  return {
    submissionId: i.submissionId,
    startedAt: i.startedAt,
    website: i.honeypot,
    formKey: "enquiry" as const,
    context: i.context,
    locale: i.lang,
    name: i.name,
    phone: i.phone,
    brand: i.brand || null,
    model: i.model,
    year: i.year,
    service: i.service || null,
    details: i.details,
    submitPath: i.submitPath,
    attribution: i.attribution,
  }
}

const CONTEXT = /^(?:enquiry|home|contact|(brand|service|page)-([a-z0-9-]{1,60}))$/

export type ContextResult =
  | { ok: true; formKey: "enquiry"; context: EnquiryContext }
  | { ok: false; field: "form" | "context"; reason: "unknown" | "disabled" }

/**
 * Resolves form key + page context. Older cached clients sent the page context
 * in `formId`; that is accepted only when it is not itself a form key.
 */
export function resolveEnquiryContext(doc: WebsiteDocument, body: Record<string, unknown>): ContextResult {
  const legacy = typeof body.formId === "string" ? body.formId : undefined
  const legacyIsKey = legacy !== undefined && Object.prototype.hasOwnProperty.call(doc.forms, legacy)

  const formKeyRaw = body.formKey ?? (legacyIsKey ? legacy : "enquiry")
  if (formKeyRaw !== "enquiry") return { ok: false, field: "form", reason: "unknown" }
  if (!doc.forms.enquiry.enabled) return { ok: false, field: "form", reason: "disabled" }

  const ctxRaw = body.context ?? (legacy !== undefined && !legacyIsKey ? legacy : "enquiry")
  if (typeof ctxRaw !== "string") return { ok: false, field: "context", reason: "unknown" }
  const m = CONTEXT.exec(ctxRaw)
  if (!m) return { ok: false, field: "context", reason: "unknown" }

  const [, kind, slug] = m
  if (!kind) return { ok: true, formKey: "enquiry", context: { kind: "general", id: ctxRaw as "enquiry" | "home" | "contact" } }
  if (kind === "brand") {
    const brand = doc.brands.find((b) => b.slug === slug && b.visible)
    return brand ? { ok: true, formKey: "enquiry", context: { kind, id: ctxRaw, brand } } : { ok: false, field: "context", reason: "unknown" }
  }
  if (kind === "service") {
    const service = doc.services.find((s) => s.slug === slug && s.visible)
    return service ? { ok: true, formKey: "enquiry", context: { kind, id: ctxRaw, service } } : { ok: false, field: "context", reason: "unknown" }
  }
  const page = doc.pages.custom.find((p) => p.slug === slug && p.visible)
  return page ? { ok: true, formKey: "enquiry", context: { kind: "page", id: ctxRaw, pageSlug: page.slug } } : { ok: false, field: "context", reason: "unknown" }
}
