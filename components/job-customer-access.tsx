"use client"

import * as React from "react"
import { Card, Button } from "@/components/ui"
import { getJobCustomerAccess, resendCheckInForJob, type JobAccessInfo } from "@/lib/actions-customer-portal"
import {
  Loader2,
  Copy,
  MessageCircle,
  Mail,
  ExternalLink,
  CircleCheck,
  CircleAlert,
  ShieldCheck,
} from "lucide-react"

// Job Card "Customer access" panel. Self-loads the live portal/tracking status
// so staff can see whether the customer was notified and re-share the link.
export function JobCustomerAccess({ jobId }: { jobId: string }) {
  const [info, setInfo] = React.useState<JobAccessInfo | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [copied, setCopied] = React.useState(false)
  const [resending, setResending] = React.useState(false)
  const [toast, setToast] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancel = false
    getJobCustomerAccess(jobId)
      .then((r) => !cancel && setInfo(r))
      .finally(() => !cancel && setLoading(false))
    return () => {
      cancel = true
    }
  }, [jobId])

  async function copyLink() {
    if (!info?.trackingUrl) return
    try {
      await navigator.clipboard.writeText(info.trackingUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setToast("Your browser blocked copy — long-press the link to copy it.")
    }
  }

  function shareWhatsApp() {
    if (!info?.trackingUrl) return
    const digits = (info.mobile ?? "").replace(/[^\d]/g, "")
    const msg = `Hi ${info.customerName}, track your ${info.vehicleLabel} live at SHWURX Garage: ${info.trackingUrl}`
    const href = digits
      ? `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`
    window.open(href, "_blank", "noopener,noreferrer")
  }

  async function resend() {
    setResending(true)
    setToast(null)
    try {
      const res = await resendCheckInForJob(jobId)
      setToast(res.emailStatus === "sent" ? "Check-in email re-sent." : "Could not re-send the email.")
      setInfo((prev) =>
        prev ? { ...prev, emailStatus: res.emailStatus === "sent" ? "sent" : "failed" } : prev,
      )
    } catch {
      setToast("Could not re-send the email.")
    } finally {
      setResending(false)
    }
  }

  if (loading) {
    return (
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Customer access</h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </Card>
    )
  }

  if (!info || !info.hasCustomer) return null

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Customer access</h2>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip ok={info.portalStatus === "created"} label={info.portalStatus === "created" ? "Portal account" : "No account"} />
        <Chip
          ok={info.emailStatus === "sent"}
          label={info.emailStatus === "sent" ? "Email sent" : info.emailStatus === "failed" ? "Email failed" : "Email not sent"}
        />
        {info.passwordStatus === "completed" ? (
          <Chip ok label="Password set" />
        ) : (
          <Chip ok={false} label="Awaiting password" />
        )}
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        {info.email ? (
          <>
            Portal & tracking links are tied to <span className="font-medium text-foreground">{info.email}</span>.
          </>
        ) : (
          <>This customer has no email on file — share the tracking link directly.</>
        )}
      </p>

      {info.trackingUrl && (
        <div className="mt-3 rounded-lg border border-border bg-background/50 p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Tracking link</div>
          <p className="mt-1 break-all text-xs">{info.trackingUrl}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={copyLink}>
              <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={shareWhatsApp}>
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </Button>
            {info.email && (
              <Button type="button" variant="outline" size="sm" onClick={resend} disabled={resending}>
                {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Resend email
              </Button>
            )}
            <a href={info.trackingUrl} target="_blank" rel="noopener noreferrer">
              <Button type="button" variant="outline" size="sm">
                <ExternalLink className="h-4 w-4" /> Open
              </Button>
            </a>
          </div>
        </div>
      )}

      {toast && <p className="mt-2 text-xs text-muted-foreground">{toast}</p>}
    </Card>
  )
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
        ok ? "bg-primary/15 text-primary" : "bg-amber-500/15 text-amber-500"
      }`}
    >
      {ok ? <CircleCheck className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
      {label}
    </span>
  )
}
