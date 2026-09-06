import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { createServiceClient } from "@/lib/supabase/server"

/**
 * Stripe webhook that marks an invoice paid even if the customer closes the tab
 * before returning from Checkout. Requires STRIPE_WEBHOOK_SECRET to be set; when
 * it isn't configured yet the route safely no-ops (the return-based confirm on
 * /pay/[token] still records the payment).
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ received: true, skipped: "no_webhook_secret" })

  const body = await req.text()
  const sig = req.headers.get("stripe-signature")
  if (!sig) return NextResponse.json({ error: "missing signature" }, { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret)
  } catch (err) {
    return NextResponse.json({ error: `invalid signature: ${(err as Error).message}` }, { status: 400 })
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session
    const invoiceId = session.metadata?.invoice_id
    if (invoiceId && session.payment_status === "paid") {
      const svc = createServiceClient()
      const { data: inv } = await svc
        .from("invoices")
        .select("id, total, amount_paid, status")
        .eq("id", invoiceId)
        .maybeSingle()

      if (inv && inv.status !== "paid") {
        const { data: existing } = await svc
          .from("payments")
          .select("id")
          .eq("invoice_id", inv.id)
          .eq("reference", session.id)
          .maybeSingle()

        if (!existing) {
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
        }
      }
    }
  }

  return NextResponse.json({ received: true })
}
