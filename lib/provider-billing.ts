/** Vercel team that owns this project. Direct team URLs avoid the team picker that /d?to= deep links show. */
export const VERCEL_TEAM_URL = "https://vercel.com/wurx1"

/** Direct billing / top-up page for each monitored provider. */
export const PROVIDER_PAY_URL: Record<string, string> = {
  ai_gateway: `${VERCEL_TEAM_URL}/~/ai`,
  whatsapp: "https://hub.360dialog.com/dashboard/billing",
  resend: "https://resend.com/settings/billing",
  stripe: "https://dashboard.stripe.com/settings/billing",
  blob: `${VERCEL_TEAM_URL}/~/settings/billing`,
  meta: "https://business.facebook.com/billing_hub",
  google_ads: "https://ads.google.com/aw/billing/summary",
  carsxe: "https://api.carsxe.com/dashboard",
}

/** Below this AI Gateway balance (USD) staff get an early "top up soon" alert. */
export const AI_CREDIT_LOW_USD = 5
