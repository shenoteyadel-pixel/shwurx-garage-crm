"use client"

import { MessageCircle, Phone } from "lucide-react"
import { cn } from "@/lib/utils"

export function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`
}

export function waHref(whatsapp: string, text?: string) {
  const digits = whatsapp.replace(/\D/g, "")
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`
}

/**
 * Call + WhatsApp buttons. Clicks are counted by <TrackingGate>'s delegated
 * listener as intent only, never as leads; `context` labels where they were.
 */
export function ContactActions({
  phone,
  whatsapp,
  callLabel,
  whatsappLabel,
  whatsappText,
  context,
  className,
}: {
  phone: string
  whatsapp: string
  callLabel: string
  whatsappLabel: string
  whatsappText?: string
  context: string
  className?: string
}) {
  if (!phone && !whatsapp) return null
  return (
    <div className={cn("flex flex-wrap gap-3", className)} data-track-context={context}>
      {phone && (
        <a
          href={telHref(phone)}
          className="inline-flex h-12 items-center gap-2 rounded-lg border border-border bg-card px-5 text-sm font-semibold text-foreground transition hover:border-primary/60"
        >
          <Phone className="h-4 w-4 text-primary" aria-hidden="true" />
          {callLabel}
          <span className="sr-only">: </span>
          <span dir="ltr" className="font-normal text-muted-foreground">
            {phone}
          </span>
        </a>
      )}
      {whatsapp && (
        <a
          href={waHref(whatsapp, whatsappText)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 items-center gap-2 rounded-lg border border-border bg-card px-5 text-sm font-semibold text-foreground transition hover:border-primary/60"
        >
          <MessageCircle className="h-4 w-4 text-primary" aria-hidden="true" />
          {whatsappLabel}
        </a>
      )}
    </div>
  )
}
