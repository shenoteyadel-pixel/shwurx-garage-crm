"use client"

import * as React from "react"
import { sendApproval } from "@/lib/actions"
import { Button, Card } from "@/components/ui"
import { Copy, Check, MessageCircle, Send } from "lucide-react"

export function ApprovalSender({
  jobId,
  token,
  hasQuotation,
  approvalStatus,
  customerName,
  vehicle,
}: {
  jobId: string
  token: string
  hasQuotation: boolean
  approvalStatus: "pending" | "approved" | "rejected"
  customerName: string
  vehicle: string
}) {
  const [copied, setCopied] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [link, setLink] = React.useState("")
  const [msg, setMsg] = React.useState<string | null>(null)

  React.useEffect(() => {
    setLink(`${window.location.origin}/approve/${token}`)
  }, [token])

  async function copy() {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  async function sendWhatsApp() {
    setSending(true)
    setMsg(null)
    try {
      await sendApproval(jobId)
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, link, customerName, vehicle }),
      })
      const data = await res.json()
      if (data.mode === "cloud_api" && data.ok) {
        setMsg("Approval request sent via WhatsApp.")
      } else if (data.waLink) {
        window.open(data.waLink, "_blank")
        setMsg("Opened WhatsApp with the approval message.")
      } else {
        setMsg(data.error || "Could not send. Copy the link and share it manually.")
      }
    } finally {
      setSending(false)
    }
  }

  if (approvalStatus === "approved") {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5 p-5">
        <div className="flex items-center gap-2 text-emerald-300">
          <Check className="h-4 w-4" />
          <span className="text-sm font-medium">Customer approved the quotation</span>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Customer Approval
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {approvalStatus === "rejected"
          ? "Customer rejected the previous quotation. Update it and resend."
          : "Generate a secure link the customer can open to review photos and the quotation."}
      </p>

      {!hasQuotation && (
        <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300">
          Save a quotation first so the customer has something to approve.
        </p>
      )}

      <div className="flex items-center gap-2 rounded-lg border border-border bg-background/60 p-2">
        <input
          readOnly
          value={link}
          className="min-w-0 flex-1 bg-transparent px-2 text-sm text-muted-foreground focus:outline-none"
        />
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" onClick={sendWhatsApp} disabled={sending || !hasQuotation} variant="success">
          <MessageCircle className="h-4 w-4" />
          {sending ? "Sending..." : "Send via WhatsApp"}
        </Button>
        <a href={link} target="_blank" rel="noreferrer">
          <Button type="button" variant="outline">
            <Send className="h-4 w-4" /> Preview link
          </Button>
        </a>
      </div>

      {msg && <p className="mt-3 text-xs text-muted-foreground">{msg}</p>}
    </Card>
  )
}
