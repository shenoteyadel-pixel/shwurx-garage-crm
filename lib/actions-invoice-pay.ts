"use server"

import { revalidatePath } from "next/cache"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"
import { appBaseUrl } from "@/lib/account-links"
import { sendEmail, invoiceLinkEmail } from "@/lib/email"
import { waMeLink } from "@/lib/whatsapp"

function money(n: number) {
  return `AED ${Number(n).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Build a WhatsApp share link (staff-authenticated) for sending the invoice
 * pay link to the customer. Returns a wa.me URL the browser opens.
 */
export async function whatsappInvoiceLink(invoiceId: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const supabase = await createClient()
  const { data: inv } = await supabase
    .from("invoices")
    .select("invoice_number, customer_name, customer_mobile, vehicle_desc, total, amount_paid, public_token")
    .eq("id", invoiceId)
    .maybeSingle()
  if (!inv) return { ok: false, error: "Invoice not found" }
  if (!inv.customer_mobile) return { ok: false, error: "No customer mobile on this invoice" }

  const balance = Math.max(0, (Number(inv.total) || 0) - (Number(inv.amount_paid) || 0))
  const link = invoicePublicUrl(inv.public_token)
  const message =
    `Hello ${inv.customer_name || "there"}, this is SHWURX Auto Service Center.\n\n` +
    `Your invoice ${inv.invoice_number}${inv.vehicle_desc ? ` for ${inv.vehicle_desc}` : ""} is ready.\n` +
    `Amount due: ${money(balance)}\n\n` +
    `View your invoice and pay securely by card here:\n${link}\n\nThank you.`
  return { ok: true, url: waMeLink(inv.customer_mobile, message) }
}

/** Email the invoice pay link to the customer via Resend. */
export async function emailInvoiceLink(invoiceId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: inv } = await supabase
    .from("invoices")
    .select("invoice_number, customer_name, customer_mobile, vehicle_desc, total, amount_paid, public_token, jobs(customers(email, full_name))")
    .eq("id", invoiceId)
    .maybeSingle()
  if (!inv) return { ok: false, error: "Invoice not found" }

  const email = ((inv as any).jobs?.customers?.email as string | undefined) ?? undefined
  if (!email) return { ok: false, error: "No customer email on file for this invoice" }

  const balance = Math.max(0, (Number(inv.total) || 0) - (Number(inv.amount_paid) || 0))
  const res = await sendEmail({
    to: email,
    subject: `Your invoice ${inv.invoice_number} — SHWURX Auto Service Center`,
    html: invoiceLinkEmail({
      name: inv.customer_name || ((inv as any).jobs?.customers?.full_name as string) || "there",
      vehicle: inv.vehicle_desc || "your vehicle",
      invoiceNumber: inv.invoice_number,
      total: money(Number(inv.total) || 0),
      balance: money(balance),
      url: invoicePublicUrl(inv.public_token),
    }),
    idempotencyKey: `invoice-link-${inv.public_token}`,
  })
  if (!res.sent) return { ok: false, error: res.error || "Email failed" }
  return { ok: true }
}

/** Public URL a customer opens to view + pay an invoice. */
export function invoicePublicUrl(token: string) {
  return `${appBaseUrl()}/pay/${token}`
}

type PublicInvoice = {
  id: string
  invoice_number: string
  status: string
  total: number
  amount_paid: number
  balance: number
  customer_name: string | null
  vehicle_desc: string | null
  plate: string | null
  public_token: string
}

/** Load the customer-facing invoice for a public token (service client, no auth). */
export async function getPublicInvoice(token: string): Promise<PublicInvoice | null> {
  if (!token) return null
  const svc = createServiceClient()
  const { data } = await svc
    .from("invoices")
    .select("id, invoice_number, status, total, amount_paid, customer_name, vehicle_desc, plate, public_token")
    .eq("public_token", token)
    .maybeSingle()
  if (!data) return null
  const total = Number(data.total) || 0
  const amount_paid = Number(data.amount_paid) || 0
  return {
    id: data.id,
    invoice_number: data.invoice_number,
    status: data.status,
    total,
    amount_paid,
    balance: Math.max(0, total - amount_paid),
    customer_name: data.customer_name,
    vehicle_desc: data.vehicle_desc,
    plate: data.plate,
    public_token: data.public_token,
  }
}

/**
 * Create an embedded Stripe Checkout session for the invoice's OUTSTANDING
 * balance. The amount is computed server-side from the database so the customer
 * can never tamper with the price. Returns the client secret for the embedded UI.
 */
export async function createInvoiceCheckoutSession(token: string): Promise<{ clientSecret: string | null; error?: string }> {
  const inv = await getPublicInvoice(token)
  if (!inv) return { clientSecret: null, error: "Invoice not found" }
  if (inv.status === "cancelled") return { clientSecret: null, error: "This invoice was cancelled" }
  if (inv.balance <= 0.01) return { clientSecret: null, error: "This invoice is already paid" }

  const amountInFils = Math.round(inv.balance * 100)
  const vehicle = inv.vehicle_desc ? ` · ${inv.vehicle_desc}` : ""

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ui_mode: "embedded_page",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "aed",
          unit_amount: amountInFils,
          product_data: { name: `Invoice ${inv.invoice_number}${vehicle}` },
        },
      },
    ],
    metadata: { invoice_id: inv.id, public_token: token },
    return_url: `${invoicePublicUrl(token)}?session_id={CHECKOUT_SESSION_ID}`,
  })

  return { clientSecret: session.client_secret ?? null }
}

/**
 * Verify a completed Checkout session on the customer's return and record the
 * payment. Idempotent: a session already recorded (or an already-paid invoice)
 * is a no-op. Runs with the service client since the customer isn't logged in.
 */
export async function confirmInvoiceCheckout(token: string, sessionId: string): Promise<{ paid: boolean }> {
  if (!token || !sessionId) return { paid: false }
  const svc = createServiceClient()

  const { data: inv } = await svc
    .from("invoices")
    .select("id, total, amount_paid, status, public_token, stripe_session_id")
    .eq("public_token", token)
    .maybeSingle()
  if (!inv) return { paid: false }
  if (inv.status === "paid") return { paid: true }

  const session = await stripe.checkout.sessions.retrieve(sessionId)
  if (session.metadata?.invoice_id !== inv.id) return { paid: false }
  if (session.payment_status !== "paid") return { paid: false }

  // Guard against double-recording the same session.
  const { data: existing } = await svc
    .from("payments")
    .select("id")
    .eq("invoice_id", inv.id)
    .eq("reference", session.id)
    .maybeSingle()
  if (existing) return { paid: true }

  const amount = (session.amount_total ?? 0) / 100
  await svc.from("payments").insert({
    direction: "in",
    invoice_id: inv.id,
    amount,
    method: "card",
    reference: session.id,
    note: "Stripe online payment",
  })

  const paid = (Number(inv.amount_paid) || 0) + amount
  const total = Number(inv.total) || 0
  const status = paid >= total - 0.01 ? "paid" : paid > 0 ? "partial" : "unpaid"
  await svc
    .from("invoices")
    .update({ amount_paid: paid, status, stripe_session_id: session.id, updated_at: new Date().toISOString() })
    .eq("id", inv.id)

  revalidatePath(`/invoices/${inv.id}`)
  revalidatePath("/invoices")
  revalidatePath(`/pay/${token}`)
  return { paid: status === "paid" }
}
