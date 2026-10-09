"use client"

import { useRef, useState } from "react"
import { Card } from "@/components/ui"
import { cn } from "@/lib/utils"
import { Bot, Send, Loader2, Copy, Check, RotateCcw } from "lucide-react"

type Msg = { role: "user" | "assistant"; content: string }

const SUGGESTIONS = [
  { label: "Today's workshop board", prompt: "Give me today's workshop board: how many cars per stage, and which are overdue or stuck?" },
  { label: "Waiting for approval", prompt: "Which cars are waiting for customer approval, and how long have they been waiting?" },
  { label: "Blocked on parts", prompt: "Which cars are blocked waiting for parts?" },
  { label: "Today's appointments", prompt: "What appointments do we have today?" },
  { label: "Find a car", prompt: "Find the car with plate " },
  { label: "Draft a customer update", prompt: "Draft a WhatsApp update for the customer of job " },
]

export function AdvisorChat({ userName }: { userName: string }) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  function scrollToEnd() {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }))
  }

  async function send(text: string) {
    const question = text.trim()
    if (!question || loading) return
    setError(null)
    const next: Msg[] = [...messages, { role: "user", content: question }]
    setMessages([...next, { role: "assistant", content: "" }])
    setInput("")
    setLoading(true)
    scrollToEnd()

    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      })
      if (!res.ok || !res.body) {
        throw new Error(res.status === 403 ? "You don't have access to the Service Advisor AI." : "Request failed. Please try again.")
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: acc }])
        scrollToEnd()
      }
      if (!acc.trim()) {
        setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: "I couldn't produce an answer for that. Try rephrasing or give me a plate or job number." }])
      }
    } catch (e) {
      setMessages((m) => m.slice(0, -1))
      setError((e as Error).message || "Something went wrong.")
    } finally {
      setLoading(false)
    }
  }

  function applySuggestion(prompt: string) {
    if (prompt.endsWith(" ")) {
      setInput(prompt)
      inputRef.current?.focus()
    } else {
      send(prompt)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return
      e.preventDefault()
      send(input)
    }
  }

  async function copy(i: number, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(i)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  const firstName = userName.split(" ")[0]

  return (
    <Card className="flex min-h-[70vh] flex-col p-0">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Bot className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold">Service Advisor AI</p>
            <p className="text-xs text-muted-foreground">Live workshop data · read-only</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => {
              setMessages([])
              setError(null)
            }}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            New chat
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5" aria-live="polite">
        {messages.length === 0 ? (
          <div className="m-auto flex max-w-xl flex-col items-center gap-5 text-center">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-balance text-xl font-semibold">
                {"Hi "}
                {firstName}
                {", which car are we handling?"}
              </h2>
              <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                Ask about any car, job card or customer. I check the live CRM: stages, overdue cars, approvals, parts,
                appointments and service history. I can also draft customer messages in English or Arabic.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => applySuggestion(s.prompt)}
                  className="rounded-full border border-border bg-background/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => {
            const isLast = i === messages.length - 1
            return (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn("flex max-w-[85%] flex-col gap-1", m.role === "user" ? "items-end" : "items-start")}>
                  <div
                    dir="auto"
                    className={cn(
                      "whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                      m.role === "user" ? "bg-primary text-primary-foreground" : "border border-border bg-background/60 text-foreground",
                    )}
                  >
                    {m.content ||
                      (loading && isLast ? (
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          Checking the CRM…
                        </span>
                      ) : (
                        ""
                      ))}
                  </div>
                  {m.role === "assistant" && m.content && !(loading && isLast) && (
                    <button
                      onClick={() => copy(i, m.content)}
                      className="flex items-center gap-1 px-1 text-xs text-muted-foreground transition hover:text-foreground"
                    >
                      {copied === i ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
                      {copied === i ? "Copied" : "Copy"}
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border px-5 py-4">
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex items-end gap-2">
          <label htmlFor="advisor-input" className="sr-only">
            Ask the Service Advisor AI
          </label>
          <textarea
            id="advisor-input"
            ref={inputRef}
            value={input}
            dir="auto"
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Plate, job number, customer, or a question…"
            className="max-h-40 min-h-11 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-primary"
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Answers use live CRM data. Check figures on the job card before quoting a customer.</p>
      </div>
    </Card>
  )
}
