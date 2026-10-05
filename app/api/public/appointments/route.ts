import { createServiceClient } from "@/lib/supabase/server"
import { preflight, jsonWithCors } from "@/lib/public-cors"
import { notifyByPermission } from "@/lib/actions-notifications"
import { findBySubmission, intakeMetadata, SUBMISSION_UUID } from "@/lib/website/intake-dedupe"
import { conversionToken } from "@/lib/website/conversion-token"
import { intakeIsDryRun, readBoundedJson } from "@/lib/website/intake-guard"
import { submitOnce } from "@/lib/website/submit-once"

export const runtime = "nodejs"

export function OPTIONS(request: Request) {
  return preflight(request)
}

/**
 * Public appointment / booking submission from the SHWURX website.
 * Writes through the `submit_appointment` SECURITY DEFINER RPC, then alerts
 * every staff member who can manage appointments so the front desk can act.
 */
export async function POST(request: Request) {
  try {
    const raw = await readBoundedJson(request)
    if (!raw) return jsonWithCors(request, { ok: false, outcome: "rejected", error: "bad_request" }, 413)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = raw as any
    const name = String(body?.name ?? "").trim()
    const phone = String(body?.phone ?? "").trim()

    if (!name) return jsonWithCors(request, { ok: false, outcome: "invalid", error: "missing_name" }, 400)
    if (!phone) return jsonWithCors(request, { ok: false, outcome: "invalid", error: "missing_phone" }, 400)

    // Previews validate but never create bookings, staff alerts or emails.
    if (await intakeIsDryRun()) return jsonWithCors(request, { ok: true, outcome: "dry_run", id: null })

    // Durable once-per-submission: pre-select fast path, plus 23505 recovery
    // against appointments_submission_id_uniq (scripts/060) for simultaneous submits.
    const submissionId = typeof body.submissionId === "string" && SUBMISSION_UUID.test(body.submissionId) ? body.submissionId : null
    const persisted = (outcome: "received" | "duplicate", id: string) =>
      jsonWithCors(request, { ok: true, outcome, id, conversionToken: conversionToken("appointment", id) })

    const supabase = createServiceClient()
    const result = await submitOnce({
      submissionId,
      find: (sid) => findBySubmission("appointments", sid),
      insert: async () => {
        const { data, error } = await supabase.rpc("submit_appointment", {
      p_name: name,
      p_phone: phone,
      p_email: body?.email ?? null,
      p_vehicle_make: body?.vehicleMake ?? body?.vehicle_make ?? null,
      p_vehicle_model: body?.vehicleModel ?? body?.vehicle_model ?? null,
      p_vehicle_year: body?.vehicleYear ?? body?.vehicle_year ?? null,
      p_plate_number: body?.plateNumber ?? body?.plate_number ?? null,
      p_service_interest: body?.serviceInterest ?? body?.service_interest ?? null,
      p_preferred_date: body?.preferredDate ?? body?.preferred_date ?? null,
      p_preferred_time: body?.preferredTime ?? body?.preferred_time ?? null,
      p_notes: body?.notes ?? null,
      p_source: body?.source ?? "website",
      p_metadata: intakeMetadata(body, "appointment", submissionId, ["logistics"]),
        })
        if (error) return { ok: false, code: error.code ?? null, error: "not_persisted" }
        if (!data?.ok || !data?.id) return { ok: false, error: data?.error ?? "not_persisted" }
        return { ok: true, id: String(data.id) }
      },
    })

    if (result.outcome === "error") return jsonWithCors(request, { ok: false, outcome: "error", error: result.error }, 400)
    // A concurrent duplicate already alerted staff via the winning request.
    if (result.outcome === "duplicate") return persisted("duplicate", result.id)
    const data = { id: result.id }

    const logisticsType = String(body?.metadata?.logistics?.type ?? "dropoff")
    const typeLabel =
      logisticsType === "pickup_delivery"
        ? "Pickup & Delivery"
        : logisticsType === "pickup"
          ? "Pickup"
          : null

    // Best-effort staff alert (never blocks the customer's booking).
    try {
      const service = body?.serviceInterest ?? body?.service_interest
      await notifyByPermission("appointments.manage", {
        title: typeLabel ? `New ${typeLabel} booking` : "New website booking",
        body: `${name} requested an appointment${service ? ` for ${service}` : ""}${
          typeLabel ? ` — ${typeLabel} required (assign a driver).` : "."
        }`,
        type: typeLabel ? "warning" : "info",
        link: "/appointments",
      })
    } catch {
      /* notification is best-effort */
    }

    // Best-effort customer confirmation email (never blocks the booking).
    const email = String(body?.email ?? "").trim()
    if (email) {
      try {
        const { sendAppointmentConfirmationEmail } = await import("@/lib/email")
        await sendAppointmentConfirmationEmail({
          to: email,
          name,
          serviceInterest: (body?.serviceInterest ?? body?.service_interest ?? null) as string | null,
          logisticsType,
          logistics: (body?.metadata?.logistics ?? null) as Record<string, unknown> | null,
        })
      } catch {
        /* email is best-effort */
      }
    }

    return persisted("received", String(data.id))
  } catch {
    return jsonWithCors(request, { ok: false, error: "server_error" }, 500)
  }
}
