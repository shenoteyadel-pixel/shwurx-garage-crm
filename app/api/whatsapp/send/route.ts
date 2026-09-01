import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { buildApprovalMessage, normalizeMobile, waMeLink } from "@/lib/whatsapp"
import { formatCurrency } from "@/lib/utils"

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { jobId } = await request.json()
  if (!jobId) return NextResponse.json({ error: "missing jobId" }, { status: 400 })

  const { data: job } = await supabase
    .from("jobs")
    .select("job_number, customer_name, customer_mobile, vehicle_make, vehicle_model, approval_token")
    .eq("id", jobId)
    .single()
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 })

  const { data: quote } = await supabase
    .from("quotations")
    .select("total")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const origin = new URL(request.url).origin
  const link = `${origin}/approve/${job.approval_token}`
  const vehicle = [job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ") || "your vehicle"
  const message = buildApprovalMessage({
    customerName: job.customer_name,
    jobNumber: job.job_number,
    vehicle,
    total: formatCurrency(quote?.total ?? 0),
    link,
  })

  const token = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_ID
  const fallback = waMeLink(job.customer_mobile, message)

  // If the Meta WhatsApp Cloud API is configured, send automatically.
  if (token && phoneId) {
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: normalizeMobile(job.customer_mobile),
          type: "text",
          text: { body: message },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        return NextResponse.json({ sent: false, fallback, link, error: data?.error?.message ?? "send failed" })
      }
      return NextResponse.json({ sent: true, link })
    } catch (e) {
      return NextResponse.json({ sent: false, fallback, link, error: String(e) })
    }
  }

  // Not configured — return a wa.me deep link the advisor can open to send manually.
  return NextResponse.json({ sent: false, fallback, link, configured: false })
}
