"use client"

import { useCallback } from "react"
import { loadStripe } from "@stripe/stripe-js"
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js"
import { createInvoiceCheckoutSession } from "@/lib/actions-invoice-pay"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

export function InvoiceCheckout({ token }: { token: string }) {
  const fetchClientSecret = useCallback(async () => {
    const { clientSecret, error } = await createInvoiceCheckoutSession(token)
    if (!clientSecret) throw new Error(error || "Unable to start checkout")
    return clientSecret
  }, [token])

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  )
}
