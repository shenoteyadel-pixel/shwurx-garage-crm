import "server-only"
import { stripe } from "@/lib/stripe"

export type DomainStatus = { domain: string; applePay: string; error?: string }

function siteDomains(): string[] {
  const hosts = new Set<string>()
  const add = (raw: string | undefined) => {
    if (!raw) return
    try {
      const host = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase()
      if (!host.includes(".") || host === "localhost" || host.endsWith(".vercel.app") || host.endsWith(".vusercontent.net")) return
      const bare = host.startsWith("www.") ? host.slice(4) : host
      hosts.add(bare)
      hosts.add(`www.${bare}`)
    } catch {}
  }
  add(process.env.NEXT_PUBLIC_SITE_URL)
  add(process.env.VERCEL_PROJECT_PRODUCTION_URL)
  add(process.env.RESEND_EMAIL_DOMAIN)
  return [...hosts]
}

/**
 * Apple Pay only appears in Stripe Checkout on domains registered to the
 * account behind the current secret key. Test and live mode keep separate
 * lists, so this runs against whichever key is configured and is idempotent:
 * existing domains are left alone, disabled ones are re-validated.
 */
export async function ensurePaymentMethodDomains(): Promise<DomainStatus[]> {
  const results: DomainStatus[] = []
  for (const domain of siteDomains()) {
    try {
      const existing = await stripe.paymentMethodDomains.list({ domain_name: domain, limit: 1 })
      let pmd = existing.data[0]
      if (!pmd) {
        pmd = await stripe.paymentMethodDomains.create({ domain_name: domain })
      } else if (pmd.apple_pay?.status !== "active") {
        pmd = await stripe.paymentMethodDomains.validate(pmd.id)
      }
      results.push({
        domain,
        applePay: pmd.apple_pay?.status ?? "unknown",
        error: pmd.apple_pay?.status_details?.error_message ?? undefined,
      })
    } catch (e) {
      results.push({ domain, applePay: "error", error: (e as Error).message })
    }
  }
  return results
}

let ensured: Promise<DomainStatus[]> | null = null

/** Runs registration at most once per server instance; never throws. */
export function ensurePaymentMethodDomainsOnce(): Promise<DomainStatus[]> {
  ensured ??= ensurePaymentMethodDomains().catch(() => {
    ensured = null
    return []
  })
  return ensured
}
