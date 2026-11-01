/** Direct billing / top-up page for each monitored provider. Vercel links use /d?to= so they resolve to the signed-in team. */
export const PROVIDER_PAY_URL: Record<string, string> = {
  ai_gateway: "https://vercel.com/d?to=%2F%5Bteam%5D%2F~%2Fai&title=Top+up+AI+Gateway+credits",
  whatsapp: "https://hub.360dialog.com/dashboard/billing",
  resend: "https://resend.com/settings/billing",
  stripe: "https://dashboard.stripe.com/settings/billing",
  blob: "https://vercel.com/d?to=%2F%5Bteam%5D%2F~%2Fsettings%2Fbilling&title=Vercel+billing",
  meta: "https://business.facebook.com/billing_hub",
  google_ads: "https://ads.google.com/aw/billing/summary",
  carsxe: "https://api.carsxe.com/dashboard",
}

/** Below this AI Gateway balance (USD) staff get an early "top up soon" alert. */
export const AI_CREDIT_LOW_USD = 5
