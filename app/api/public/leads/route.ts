import { createServiceClient } from "@/lib/supabase/server"
import { preflight, jsonWithCors } from "@/lib/public-cors"
import { notifyByPermission } from "@/lib/actions-notifications"
import { intakeIsDryRun, readBoundedJson } from "@/lib/website/intake-guard"
import { findBySubmission, intakeMetadata, SUBMISSION_UUID } from "@/lib/website/intake-dedupe"
import { conversionToken } from "@/lib/website/conversion-token"
import { validatePhone } from "@/lib/website/intake-validate"
import { checkContactVehicleShape, needsCatalogue, resolveContactVehicle, vehicleSummary } from "@/lib/website/contact-vehicle"
import { getPublishedDocumentStrict } from "@/lib/website/store"

export const runtime = "nodejs"

export function OPTIONS(request: Request) {
  return preflight(request)
}

/**
 * Public lead / contact-form submission from the SHWURX website.
 * Requires at least one contact method (phone or email). Writes through the
 * `submit_lead` SECURITY DEFINER RPC, then alerts staff who manage leads.
 */
export async function POST(request: Request) {
  try {
    const body = await readBoundedJson(request)
    if (!body) return jsonWithCors(request, { ok: false, outcome: "rejected", error: "bad_request" }, 413)
    const name = String(body?.name ?? "").trim()
    const email = String(body?.email ?? "").trim()
    // Phone is optional here (email-only contact is valid), but when present the RAW
    // value must pass the shared rules: never truncated into a valid number.
    const phoneCheck = validatePhone(body?.phone, { required: false })
    const phone = phoneCheck.ok ? phoneCheck.value ?? "" : ""

    if (!phoneCheck.ok) {
      return jsonWithCors(request, { ok: false, outcome: "invalid", error: "invalid_phone", fields: { phone: phoneCheck.error } }, 400)
    }
    if (!phone && !email) {
      return jsonWithCors(request, { ok: false, outcome: "invalid", error: "missing_contact" }, 400)
    }

    // Catalogue-independent vehicle checks (shape, slug format, year policy).
    const shapeFields = checkContactVehicleShape(body)
    if (Object.keys(shapeFields).length) {
      return jsonWithCors(request, { ok: false, outcome: "invalid", error: "invalid_vehicle", fields: shapeFields }, 400)
    }

    // Selected brand/service are re-derived from the published catalogue. If it
    // cannot be read, answer 503 and write nothing rather than drop the selection.
    const resolveVehicle = async () => {
      const doc = needsCatalogue(body) ? await getPublishedDocumentStrict().catch(() => null) : null
      const check = resolveContactVehicle(doc, body)
      if (check.ok) return { vehicle: check.vehicle }
      if (check.unavailable) {
        return { reply: jsonWithCors(request, { ok: false, outcome: "unavailable", error: "catalogue_unavailable" }, 503) }
      }
      return { reply: jsonWithCors(request, { ok: false, outcome: "invalid", error: "invalid_vehicle", fields: check.fields }, 400) }
    }

    // Previews run full validation but never look up or create real records.
    if (await intakeIsDryRun()) {
      const preview = await resolveVehicle()
      if (preview.reply) return preview.reply
      return jsonWithCors(request, { ok: true, outcome: "dry_run", id: null })
    }

    // A retry of an already received submission returns the same record before
    // any NEW-request catalogue check, so a since-hidden brand/service cannot turn
    // a response-loss retry into a 400. No metadata rewrite, no second alert.
    const submissionId = typeof body.submissionId === "string" && SUBMISSION_UUID.test(body.submissionId) ? body.submissionId : null
    const persisted = (outcome: "received" | "duplicate", id: string) =>
      jsonWithCors(request, { ok: true, outcome, id, conversionToken: conversionToken("lead", id) })
    if (submissionId) {
      const existing = await findBySubmission("leads", submissionId)
      if (existing) return persisted("duplicate", existing)
    }

    const resolved = await resolveVehicle()
    if (resolved.reply) return resolved.reply
    const vehicle = resolved.vehicle

    const rawMessage = typeof body?.message === "string" ? body.message.trim() : ""
    const summary = vehicleSummary(vehicle)
    const message = [summary, rawMessage].filter(Boolean).join("\n\n") || null
    const supabase = createServiceClient()
    const { data, error } = await supabase.rpc("submit_lead", {
      p_name: name || null,
      p_phone: phone || null,
      p_email: email || null,
      p_message: message,
      p_service_interest:
        [vehicle.brandName, vehicle.serviceName].filter(Boolean).join(" · ") || (body?.serviceInterest ?? body?.service_interest ?? null),
      p_source: body?.source ?? "website",
      p_metadata: {
        ...intakeMetadata(body, "contact", submissionId, []),
        phone_digits: phoneCheck.digits,
        brand_slug: vehicle.brandSlug,
        service_slug: vehicle.serviceSlug,
        vehicle_model: vehicle.model,
        vehicle_year: vehicle.year,
      },
    })

    if (error || !data?.ok) {
      // Lost a race on the unique submission index: the other request's row is the answer.
      const raced = submissionId ? await findBySubmission("leads", submissionId) : null
      if (raced) return persisted("duplicate", raced)
    }
    if (error) return jsonWithCors(request, { ok: false, outcome: "error", error: "not_persisted" }, 400)
    if (!data?.ok || !data?.id) return jsonWithCors(request, { ok: false, outcome: "error", error: data?.error ?? "not_persisted" }, 400)

    try {
      await notifyByPermission("leads.manage", {
        title: "New website enquiry",
        body: `${name || "A visitor"} left an enquiry via the website.`,
        type: "info",
        link: "/leads",
      })
    } catch {
      /* notification is best-effort */
    }

    return persisted("received", String(data.id))
  } catch {
    return jsonWithCors(request, { ok: false, error: "server_error" }, 500)
  }
}
