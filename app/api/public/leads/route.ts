import { createPublicClient } from "@/lib/supabase/public"
import { preflight, jsonWithCors } from "@/lib/public-cors"
import { notifyByPermission } from "@/lib/actions-notifications"

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
    const body = await request.json().catch(() => ({}))
    const name = String(body?.name ?? "").trim()
    const phone = String(body?.phone ?? "").trim()
    const email = String(body?.email ?? "").trim()

    if (!phone && !email) {
      return jsonWithCors(request, { ok: false, error: "missing_contact" }, 400)
    }

    const supabase = createPublicClient()
    const { data, error } = await supabase.rpc("submit_lead", {
      p_name: name || null,
      p_phone: phone || null,
      p_email: email || null,
      p_message: body?.message ?? null,
      p_service_interest: body?.serviceInterest ?? body?.service_interest ?? null,
      p_source: body?.source ?? "website",
      p_metadata: body?.metadata && typeof body.metadata === "object" ? body.metadata : {},
    })

    if (error) return jsonWithCors(request, { ok: false, error: error.message }, 400)
    if (!data?.ok) return jsonWithCors(request, data, 400)

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

    return jsonWithCors(request, data)
  } catch {
    return jsonWithCors(request, { ok: false, error: "server_error" }, 500)
  }
}
