import { createPublicClient } from "@/lib/supabase/public"
import { preflight, jsonWithCors } from "@/lib/public-cors"
import { notifyByPermission } from "@/lib/actions-notifications"

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
    const body = await request.json().catch(() => ({}))
    const name = String(body?.name ?? "").trim()
    const phone = String(body?.phone ?? "").trim()

    if (!name) return jsonWithCors(request, { ok: false, error: "missing_name" }, 400)
    if (!phone) return jsonWithCors(request, { ok: false, error: "missing_phone" }, 400)

    const supabase = createPublicClient()
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
      p_metadata: body?.metadata && typeof body.metadata === "object" ? body.metadata : {},
    })

    if (error) return jsonWithCors(request, { ok: false, error: error.message }, 400)
    if (!data?.ok) return jsonWithCors(request, data, 400)

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

    return jsonWithCors(request, data)
  } catch {
    return jsonWithCors(request, { ok: false, error: "server_error" }, 500)
  }
}
