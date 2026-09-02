import "server-only"
import { Resend } from "resend"

const FROM_DOMAIN = process.env.RESEND_EMAIL_DOMAIN
const FROM = FROM_DOMAIN ? `Shwurx Garage <no-reply@${FROM_DOMAIN}>` : "Shwurx Garage <onboarding@resend.dev>"
const BRAND = "Shwurx Garage"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

type SendResult = { sent: boolean; error?: string }

/**
 * Sends a transactional email through Resend.
 * Never throws — returns { sent } so callers can fall back to the copy/share link.
 * The Resend Node SDK returns { data, error } rather than throwing.
 */
export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
  idempotencyKey?: string
}): Promise<SendResult> {
  if (!resend) {
    return { sent: false, error: "email_not_configured" }
  }
  const { error } = await resend.emails.send(
    { from: FROM, to: [opts.to], subject: opts.subject, html: opts.html },
    opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined,
  )
  if (error) {
    console.log("[v0] Resend send failed:", error.message)
    return { sent: false, error: error.message }
  }
  return { sent: true }
}

function shell(title: string, bodyHtml: string, cta: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#0f1115;font-family:Arial,Helvetica,sans-serif;color:#e5e7eb;padding:32px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#171a21;border:1px solid #262b36;border-radius:14px;overflow:hidden">
      <tr><td style="padding:28px 32px 8px">
        <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#f59e0b;font-weight:700">${BRAND}</div>
        <h1 style="margin:12px 0 0;font-size:20px;color:#ffffff">${title}</h1>
      </td></tr>
      <tr><td style="padding:8px 32px 4px;font-size:14px;line-height:1.6;color:#c4c9d4">${bodyHtml}</td></tr>
      <tr><td style="padding:20px 32px 28px">
        <a href="${cta.url}" style="display:inline-block;background:#f59e0b;color:#111827;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px">${cta.label}</a>
        <p style="margin:18px 0 0;font-size:12px;color:#8b93a1">If the button doesn't work, copy and paste this link:<br/>
          <span style="color:#93c5fd;word-break:break-all">${cta.url}</span></p>
      </td></tr>
    </table>
    <p style="margin:16px 0 0;font-size:11px;color:#6b7280">This link will expire for your security. If you didn't expect this email, you can ignore it.</p>
  </td></tr></table></body></html>`
}

export function staffInviteEmail(opts: { fullName: string; roleLabel: string; url: string }) {
  return shell(
    "Set up your workshop account",
    `<p>Hi ${opts.fullName || "there"},</p>
     <p>An administrator has created a <strong>${BRAND}</strong> account for you with the role of <strong>${opts.roleLabel}</strong>.</p>
     <p>Click below to set your password and sign in.</p>`,
    { label: "Set my password", url: opts.url },
  )
}

export function resetPasswordEmail(opts: { fullName: string; url: string }) {
  return shell(
    "Reset your password",
    `<p>Hi ${opts.fullName || "there"},</p>
     <p>We received a request to reset the password for your <strong>${BRAND}</strong> account.</p>
     <p>Click below to choose a new password. If you didn't request this, no action is needed.</p>`,
    { label: "Reset my password", url: opts.url },
  )
}

export function customerWelcomeEmail(opts: { name: string; url: string }) {
  return shell(
    "Track your vehicle online",
    `<p>Hi ${opts.name || "there"},</p>
     <p><strong>${BRAND}</strong> has set up a customer account for you. You can track your vehicle's repair progress and view invoices online.</p>
     <p>Click below to set your password and access your portal.</p>`,
    { label: "Activate my account", url: opts.url },
  )
}
