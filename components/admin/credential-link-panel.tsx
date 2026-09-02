"use client"

import { useState } from "react"
import { Button } from "@/components/ui"
import type { CredentialLinkResult } from "@/lib/actions-users"
import { Copy, Check, Mail, MessageCircle, CheckCircle2, AlertTriangle } from "lucide-react"

/**
 * Shows a freshly generated secure credential link with one-click
 * Copy / WhatsApp / Email share actions. Works whether or not the
 * automated email was delivered.
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

  const heading = purpose === "invite" ? "Set-password link ready" : "Password reset link ready"
  const message =
    purpose === "invite"
      ? `Hi! Your Shwurx Garage account is ready. Set your password here: ${result.link}`
      : `Hi! Reset your Shwurx Garage password here: ${result.link}`

  const waNumber = (phone ?? "").replace(/[^\d]/g, "")
  const waHref = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`
  const mailHref = `mailto:${result.email}?subject=${encodeURIComponent(
    purpose === "invite" ? "Set up your Shwurx Garage account" : "Reset your Shwurx Garage password",
  )}&body=${encodeURIComponent(message)}`

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
    <div className="rounded-xl border border-border bg-secondary/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        <span className="text-sm font-semibold">{heading}</span>
      </div>

      {result.emailSent ? (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-emerald-400">
          <Mail className="h-3.5 w-3.5" /> Emailed to {result.email}
        </p>
      ) : (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" /> Email not sent
          {result.emailError ? ` (${result.emailError})` : ""} — share the link manually below.
        </p>
      )}

      <div className="mb-3 break-all rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
        {result.link}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
        <a href={waHref} target="_blank" rel="noopener noreferrer" className={waNumber ? "" : "pointer-events-none opacity-40"}>
          <Button type="button" size="sm" variant="outline" disabled={!waNumber}>
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </Button>
        </a>
        <a href={mailHref}>
          <Button type="button" size="sm" variant="outline">
            <Mail className="h-4 w-4" /> Email
          </Button>
        </a>
      </div>
    </div>
  )
}
