"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, AlertTriangle, PlugZap } from "lucide-react"
import { Card } from "@/components/ui"
import { connectWebhook, type WebhookStatus } from "@/lib/actions-whatsapp-webhook"

function Row({ ok, label, detail }: { ok: boolean; label: string; detail?: string | null }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-label="OK" />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Problem" />
      )}
      <div className="flex min-w-0 flex-col">
        <span className="text-foreground">{label}</span>
        {detail && <span className="break-all text-xs text-muted-foreground">{detail}</span>}
      </div>
    </li>
  )
}

export function WebhookCard({ status }: { status: WebhookStatus }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const healthy = status.apiKey && status.secret && status.registeredMatches && status.lastEventOk !== false

  const connect = () =>
    start(async () => {
      const res = await connectWebhook()
      setMsg(res.ok ? { ok: true, text: `Connected. 360dialog now sends messages to ${res.url}` } : { ok: false, text: res.error })
      router.refresh()
    })

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-sm font-semibold text-foreground">WhatsApp connection</h2>
          <p className="text-xs text-muted-foreground">
            {healthy ? "Incoming WhatsApp messages are flowing into the CRM." : "Incoming messages are not reaching the CRM yet."}
          </p>
        </div>
        <button
          type="button"
          onClick={connect}
          disabled={pending || !status.apiKey || !status.secret}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <PlugZap className="size-4" aria-hidden />
          {pending ? "Connecting…" : status.registeredMatches ? "Reconnect webhook" : "Connect webhook"}
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        <Row ok={status.apiKey} label="360dialog API key" detail={status.apiKey ? null : "Set D360_API_KEY in project Vars."} />
        <Row ok={status.secret} label="Webhook secret" detail={status.secret ? null : "Set D360_WEBHOOK_SECRET in project Vars, then redeploy."} />
        <Row
          ok={status.registeredMatches}
          label="Webhook registered on 360dialog"
          detail={status.registeredMatches ? status.targetUrl : `Currently: ${status.registeredUrl ?? "not set"} · Expected: ${status.targetUrl}`}
        />
        <Row
          ok={status.events > 0 && status.lastEventOk !== false}
          label={`Events received: ${status.events}`}
          detail={
            status.lastEventAt
              ? `Last: ${new Date(status.lastEventAt).toLocaleString()}${status.lastError ? ` · ${status.lastError}` : ""}`
              : "Send a WhatsApp message to your business number after connecting."
          }
        />
      </ul>
      {msg && (
        <p role="status" className={msg.ok ? "text-sm text-primary" : "text-sm text-destructive"}>
          {msg.text}
        </p>
      )}
    </Card>
  )
}
