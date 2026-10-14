"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Paperclip, Send, FileText, Check, CheckCheck, AlertCircle, Clock, PanelRight, Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button, AutoTextarea } from "@/components/ui"
import { getConversation, sendText, sendMedia, claimConversation } from "@/lib/actions-whatsapp"
import { windowOpen, type WaMessageRow } from "@/lib/whatsapp-status"
import { LeadPanel } from "@/components/whatsapp/lead-panel"
import { TemplatePicker } from "@/components/whatsapp/template-picker"

function StatusIcon({ s }: { s: string }) {
  if (s === "read") return <CheckCheck className="h-3.5 w-3.5 text-sky-500" aria-label="Read" />
  if (s === "delivered") return <CheckCheck className="h-3.5 w-3.5" aria-label="Delivered" />
  if (s === "sent") return <Check className="h-3.5 w-3.5" aria-label="Sent" />
  if (s === "failed") return <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-label="Failed" />
  if (s === "blocked_test_mode") return <Lock className="h-3.5 w-3.5" aria-label="Not delivered (test mode)" />
  return <Clock className="h-3.5 w-3.5" aria-label="Queued" />
}

function Bubble({ m }: { m: WaMessageRow }) {
  const out = m.direction === "out"
  const src = m.media_blob_path ? `/api/whatsapp/media/${m.id}` : null
  const time = new Date(m.wa_timestamp ?? m.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "flex max-w-[80%] flex-col gap-1 rounded-2xl px-3 py-2 text-sm leading-relaxed",
          out ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-secondary text-secondary-foreground",
        )}
      >
        {m.type === "image" && src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={m.body || "Image from chat"} className="max-h-64 rounded-lg object-cover" loading="lazy" />
        )}
        {(m.type === "document" || m.type === "audio" || m.type === "video") && src && (
          <a href={src} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline underline-offset-2">
            <FileText className="h-4 w-4" aria-hidden /> {m.media_filename || `Open ${m.type}`}
          </a>
        )}
        {!src && m.type !== "text" && m.type !== "template" && !m.body && <span className="italic opacity-80">[{m.type}]</span>}
        {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
        <div className={cn("flex items-center justify-end gap-1 text-[11px]", out ? "text-primary-foreground/75" : "text-muted-foreground")}>
          {out && m.sent_by_name && <span>{m.sent_by_name} ·</span>}
          {m.type === "template" && <span>template ·</span>}
          <span>{time}</span>
          {out && <StatusIcon s={m.status} />}
        </div>
        {m.status === "failed" && m.error && <p className="text-[11px] text-destructive-foreground/90">{m.error}</p>}
      </div>
    </div>
  )
}

export function Thread({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { data, error, mutate } = useSWR(["wa-conv", id], () => getConversation(id), { refreshInterval: 5_000 })
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [panel, setPanel] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const count = data?.messages.length ?? 0

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [count])

  if (error) return <p className="p-4 text-sm text-destructive">{(error as Error).message}</p>
  if (!data) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>

  const { conv, perms } = data
  const open = windowOpen(conv.last_inbound_at)
  const unassigned = !conv.assigned_to

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setErr(null)
    try {
      await fn()
      await mutate()
      onChanged()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const submit = () => {
    if (!text.trim()) return
    const body = text
    run(async () => {
      await sendText(id, body)
      setText("")
    })
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground">{conv.customer_name || conv.wa_name || `+${conv.wa_phone}`}</h2>
            <p className="truncate text-xs text-muted-foreground">
              +{conv.wa_phone} · {conv.assigned_name ? `Assigned to ${conv.assigned_name}` : "Unassigned"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {unassigned && (
              <Button size="sm" disabled={busy} onClick={() => run(() => claimConversation(id))}>
                Claim lead
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setPanel((p) => !p)} aria-expanded={panel} aria-label="Lead details">
              <PanelRight className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Details</span>
            </Button>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4" aria-live="polite">
          {data.messages.map((m) => (
            <Bubble key={m.id} m={m} />
          ))}
          <div ref={endRef} />
        </div>

        {perms.send ? (
          <div className="flex flex-col gap-2 border-t border-border p-3">
            {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
            {open ? (
              <div className="flex items-end gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="sr-only"
                  aria-label="Attach file"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ""
                    if (!f) return
                    const fd = new FormData()
                    fd.set("file", f)
                    fd.set("caption", text)
                    run(async () => {
                      await sendMedia(id, fd)
                      setText("")
                    })
                  }}
                />
                <Button size="icon" variant="ghost" disabled={busy} onClick={() => fileRef.current?.click()} aria-label="Attach image or PDF">
                  <Paperclip className="h-4 w-4" aria-hidden />
                </Button>
                <AutoTextarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type a reply"
                  aria-label="Message"
                  rows={1}
                  className="max-h-40 flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      if (e.nativeEvent.isComposing || e.keyCode === 229) return
                      e.preventDefault()
                      submit()
                    }
                  }}
                />
                <Button size="icon" disabled={busy || !text.trim()} onClick={submit} aria-label="Send">
                  <Send className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  The 24-hour reply window is closed. Only an approved template can be sent.
                </p>
                <TemplatePicker id={id} disabled={busy} onSent={() => run(async () => {})} onError={setErr} />
              </div>
            )}
            {open && (
              <div className="flex justify-end">
                <TemplatePicker id={id} disabled={busy} onSent={() => run(async () => {})} onError={setErr} compact />
              </div>
            )}
          </div>
        ) : (
          <p className="border-t border-border p-3 text-xs text-muted-foreground">You can view this chat but not reply.</p>
        )}
      </div>

      {panel && (
        <div className="fixed inset-0 z-40 flex justify-end bg-background/60 lg:static lg:z-auto lg:bg-transparent">
          <LeadPanel detail={data} onClose={() => setPanel(false)} onChanged={() => { mutate(); onChanged() }} />
        </div>
      )}
    </div>
  )
}
