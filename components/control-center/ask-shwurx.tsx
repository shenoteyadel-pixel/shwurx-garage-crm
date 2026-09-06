"use client"

import { useRef, useState } from "react"
import { Card } from "@/components/ui"
import { cn } from "@/lib/utils"
import { Sparkles, Send, Loader2 } from "lucide-react"

type Msg = { role: "user" | "assistant"; content: string }

const SUGGESTIONS = [
  "Who owes me the most money right now?",
  "Which jobs are losing money?",
  "What should I deal with first today?",
  "Which parts are low on stock?",
]

export function AskShwurx() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  async function send(text: string) {
    const question = text.trim()
    if (!question || loading) return
    setError(null)
    const next: Msg[] = [...messages, { role: "user", content: question }]
    setMessages(next)
    setInput("")
    setLoading(true)
    // Placeholder assistant message we stream into.
    setMessages((m) => [...m, { role: "assistant", content: "" }])

    try {
      const res = await fetch("/api/control-center/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      })
      if (!res.ok || !res.body) throw new Error(res.status === 403 ? "Owner access required." : "Request failed.")
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        setMessages((m) => {
          const copy = [...m]
          copy[copy.length - 1] = { role: "assistant", content: acc }
          return copy
        })
        requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }))
      }
      if (!acc.trim()) {
        setMessages((m) => {
          const copy = [...m]
          copy[copy.length - 1] = { role: "assistant", content: "I couldn't produce an answer for that. Try rephrasing." }
          return copy
        })
      }
    } catch (e) {
      setMessages((m) => m.slice(0, -1))
      setError((e as Error).message || "Something went wrong.")
    } finally {
      setLoading(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return
      e.preventDefault()
      send(input)
    }
  }

  return (
    <Card className="flex flex-col p-5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ask SHWURX AI</h2>
      </div>

      <div
        ref={scrollRef}
        className="mb-3 max-h-96 min-h-24 flex-1 space-y-3 overflow-y-auto"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-pretty">
              Ask anything about your workshop — money owed, job margins, stock, or what to prioritise. Answers come
              straight from your live data.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border bg-background/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-background/60 text-foreground",
                )}
              >
                {m.content || (loading && i === messages.length - 1 ? <Loader2 className="h-4 w-4 animate-spin" /> : "")}
              </div>
            </div>
          ))
        )}
      </div>

      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask about your business…"
          className="h-11 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          aria-label="Send"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </Card>
  )
}
