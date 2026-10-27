import "server-only"

const D360_URL = "https://waba-v2.360dialog.io/messages"

type SendResult = { sent: boolean; error?: string }

/** UAE-friendly E.164 digits: 05x... -> 9715x..., strips + and spaces. */
export function normalizeWhatsAppNumber(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "")
  if (!digits) return null
  if (digits.startsWith("00")) return digits.slice(2)
  if (digits.startsWith("0") && digits.length === 10) return `971${digits.slice(1)}`
  return digits.length >= 10 ? digits : null
}

export function whatsAppConfigured(): boolean {
  return Boolean(process.env.D360_API_KEY && process.env.WHATSAPP_ALERT_TEMPLATE)
}

/**
 * Sends an approved WhatsApp template through 360dialog. Business-initiated
 * messages must use a pre-approved template, so this stays disabled until
 * WHATSAPP_ALERT_TEMPLATE names one with a single {{1}} body parameter.
 * Never throws.
 */
export async function sendWhatsAppAlert(to: string, message: string): Promise<SendResult> {
  const key = process.env.D360_API_KEY
  const template = process.env.WHATSAPP_ALERT_TEMPLATE
  if (!key || !template) return { sent: false, error: "whatsapp_not_configured" }
  const number = normalizeWhatsAppNumber(to)
  if (!number) return { sent: false, error: "invalid_number" }
  try {
    const res = await fetch(D360_URL, {
      method: "POST",
      headers: { "D360-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: number,
        type: "template",
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_ALERT_TEMPLATE_LANG || "en" },
          components: [{ type: "body", parameters: [{ type: "text", text: message.slice(0, 1000) }] }],
        },
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return { sent: false, error: `360dialog ${res.status}: ${(await res.text()).slice(0, 200)}` }
    return { sent: true }
  } catch (e) {
    return { sent: false, error: (e as Error).message }
  }
}
