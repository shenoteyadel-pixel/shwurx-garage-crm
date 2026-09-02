"use client"

import { useState } from "react"
import { Button } from "@/components/ui"
import type { CredentialLinkResult } from "@/lib/actions-users"
import { buildStaffInviteWhatsApp, buildStaffInviteEmail, buildWhatsAppLink } from "@/lib/rbac/catalog"
import { Copy, Check, Mail, MessageCircle, CheckCircle2, AlertTriangle, UserCheck } from "lucide-react"

/**
 * Professional success panel shown after an invite / reset link is generated.
 * Confirms who the account is for, whether the automated email was delivered,
 * and offers one-click Copy / WhatsApp / Email share using clean, branded
 * messages. Works whether or not the automated email went out.
 */
export function CredentialLinkPanel({
  result,
  purpose,
  phone,
}: {
  result: CredentialLinkResult
  purpose: "invite" | "reset"
  phone?: string | null
}) {
  const [copied, setCopied] = useState(false)

  const kind = purpose === "invite" ? "set" : "reset"
  const heading = purpose === "invite" ? "Account created" : "Reset link ready"
  const roleLabel = result.roleLabel ?? "staff"
  const fullName = result.fullName ?? result.email

  const waMessage = buildStaffInviteWhatsApp({
    fullName: fullName ?? "",
    jobTitle: result.jobTitle,
    roleLabel,
    link: result.link,
    kind,
  })
  const { subject, body } = buildStaffInviteEmail({
    fullName: fullName ?? "",
    jobTitle: result.jobTitle,
    roleLabel,
    link: result.link,
    kind,
  })

  const targetPhone = phone ?? result.mobile ?? null
  const waHref = buildWhatsAppLink(targetPhone, waMessage)
  const mailHref = `mailto:${result.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked; user can still select the text */
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Identity + confirmation header */}
      <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{heading}</p>
          <p className="truncate text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{fullName}</span>
            {" · "}
            {result.jobTitle?.trim() ? result.jobTitle : roleLabel}
          </p>
        </div>
      </div>

      {/* Delivery status */}
      <div className="rounded-xl border border-border bg-secondary/40 p-4">
        {result.emailSent ? (
          <p className="mb-3 flex items-center gap-1.5 text-xs text-emerald-400">
            <Mail className="h-3.5 w-3.5" /> Invite emailed to {result.email}
          </p>
        ) : (
          <p className="mb-3 flex items-start gap-1.5 text-xs text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Email not sent{result.emailError ? ` (${result.emailError})` : ""} — share the secure link manually below.
            </span>
          </p>
        )}

        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <UserCheck className="h-3.5 w-3.5" /> Secure {purpose === "invite" ? "set-password" : "reset"} link
        </p>
        <div className="mb-3 break-all rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
          {result.link}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={copy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <a
            href={waHref ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={waHref ? "" : "pointer-events-none opacity-40"}
            aria-disabled={!waHref}
          >
            <Button type="button" size="sm" variant="outline" disabled={!waHref}>
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </Button>
          </a>
          <a href={mailHref}>
            <Button type="button" size="sm" variant="outline">
              <Mail className="h-4 w-4" /> Email
            </Button>
          </a>
        </div>
        {!targetPhone && (
          <p className="mt-2 text-xs text-muted-foreground">Add a mobile number to enable WhatsApp sharing.</p>
        )}
      </div>
    </div>
  )
}
