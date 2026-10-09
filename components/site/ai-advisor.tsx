"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowUp, CalendarCheck, CheckCircle2, Mail, MessageCircle, Wrench, X } from "lucide-react"

type Lang = "en" | "ar"
type Msg = { role: "user" | "assistant"; content: string }
type Capture = "hidden" | "open" | "sending" | "done" | "dismissed"

const COPY = {
  en: {
    launcher: "Ask our AI service advisor",
    title: "AI Service Advisor",
    status: "Online · replies in seconds",
    close: "Close advisor",
    intro:
      "Hi, I'm the SHWURX AI service advisor. Tell me your car's brand, model and year, and what you're noticing. I'll explain what it could be and what we'd check.",
    suggestions: [
      "My engine warning light is on",
      "Strange noise when braking",
      "Gearbox jerks when shifting",
      "What does a full service include?",
    ],
    placeholder: "Describe your car and the issue…",
    send: "Send",
    thinking: "Checking with the workshop…",
    error: "Sorry, I couldn't answer just now. Please try again, or book an appointment.",
    emailCta: "Email me the full answer",
    captureTitle: "Get the complete answer",
    captureBody: "I'll email you a full written answer, and a service advisor will follow up on WhatsApp.",
    name: "Your name",
    phone: "WhatsApp number",
    email: "Email",
    submit: "Send me the full answer",
    later: "Maybe later",
    sending: "Preparing your answer…",
    invalid: "Please check your name, number and email.",
    failed: "Couldn't send right now. Please try again.",
    done: (n: string, e: string) => `Thanks ${n}. Your complete answer is on its way to ${e}, and a service advisor will message you shortly.`,
    doneNoEmail: (n: string) => `Thanks ${n}. A service advisor has your details and will message you shortly with the full answer.`,
    preview: "Preview mode: details are checked but not saved or emailed.",
    book: "Book an appointment",
    whatsapp: "WhatsApp us",
    disclaimer: "AI guidance only. Diagnosis and cost are confirmed at the workshop.",
  },
  ar: {
    launcher: "اسأل مستشار الخدمة الذكي",
    title: "مستشار الخدمة الذكي",
    status: "متصل · يرد خلال ثوانٍ",
    close: "إغلاق المستشار",
    intro: "مرحباً، أنا مستشار الخدمة الذكي في SHWURX. أخبرني بنوع سيارتك وموديلها وسنة صنعها وما تلاحظه، وسأشرح لك الأسباب المحتملة وما سنفحصه.",
    suggestions: ["لمبة فحص المحرك مضاءة", "صوت غريب عند الفرملة", "ناقل الحركة يرجّ عند التبديل", "ماذا تشمل الصيانة الكاملة؟"],
    placeholder: "صف سيارتك والمشكلة…",
    send: "إرسال",
    thinking: "جارٍ التحقق مع الورشة…",
    error: "عذراً، لم أتمكن من الرد الآن. حاول مرة أخرى أو احجز موعداً.",
    emailCta: "أرسل لي الإجابة الكاملة",
    captureTitle: "احصل على الإجابة الكاملة",
    captureBody: "سأرسل لك إجابة مكتوبة كاملة عبر البريد، وسيتابع معك مستشار خدمة عبر واتساب.",
    name: "اسمك",
    phone: "رقم واتساب",
    email: "البريد الإلكتروني",
    submit: "أرسل لي الإجابة الكاملة",
    later: "لاحقاً",
    sending: "جارٍ تجهيز إجابتك…",
    invalid: "يرجى التحقق من الاسم والرقم والبريد.",
    failed: "تعذر الإرسال الآن. حاول مرة أخرى.",
    done: (n: string, e: string) => `شكراً ${n}. إجابتك الكاملة في طريقها إلى ${e}، وسيتواصل معك مستشار خدمة قريباً.`,
    doneNoEmail: (n: string) => `شكراً ${n}. وصلت بياناتك إلى مستشار الخدمة وسيتواصل معك قريباً بالإجابة الكاملة.`,
    preview: "وضع المعاينة: يتم التحقق من البيانات دون حفظها أو إرسالها.",
    book: "احجز موعداً",
    whatsapp: "راسلنا واتساب",
    disclaimer: "إرشادات ذكية فقط. يتم تأكيد التشخيص والتكلفة في الورشة.",
  },
} as const

const CAPTURE_AFTER_REPLIES = 2

export function AiAdvisor({ lang, bookHref, whatsapp }: { lang: Lang; bookHref: string; whatsapp: string | null }) {
  const t = COPY[lang]
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [capture, setCapture] = useState<Capture>("hidden")
  const [notice, setNotice] = useState<string | null>(null)
  const startedAt = useRef(0)
  const threadRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)

  const replies = messages.filter((m) => m.role === "assistant" && m.content).length
  const waHref = whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, "")}` : null

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, capture, busy])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        launcherRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  function openCapture() {
    if (capture === "done" || capture === "sending") return
    if (!startedAt.current) startedAt.current = Date.now()
    setCapture("open")
  }

  async function ask(text: string) {
    const question = text.trim().slice(0, 800)
    if (!question || busy) return
    const history: Msg[] = [...messages, { role: "user", content: question }]
    setMessages([...history, { role: "assistant", content: "" }])
    setInput("")
    setBusy(true)
    setError(false)
    try {
      const res = await fetch("/api/public/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, locale: lang }),
      })
      if (!res.ok || !res.body) throw new Error(String(res.status))
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let answer = ""
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        answer += decoder.decode(value, { stream: true })
        setMessages([...history, { role: "assistant", content: answer }])
      }
      if (!answer.trim()) throw new Error("empty")
      const total = history.filter((m) => m.role === "assistant").length + 1
      if (total >= CAPTURE_AFTER_REPLIES && capture === "hidden") openCapture()
    } catch {
      setMessages(history)
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  async function submitLead(form: HTMLFormElement) {
    const data = new FormData(form)
    const name = String(data.get("name") ?? "").trim()
    const email = String(data.get("email") ?? "").trim()
    setCapture("sending")
    setNotice(null)
    try {
      const res = await fetch("/api/public/advisor/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone: String(data.get("phone") ?? ""),
          website: String(data.get("website") ?? ""),
          messages: messages.filter((m) => m.content),
          locale: lang,
          submissionId: crypto.randomUUID(),
          startedAt: startedAt.current,
          submitPath: window.location.pathname,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; outcome?: string; emailed?: boolean }
      if (!json.ok) {
        setCapture("open")
        setNotice(json.outcome === "invalid" ? t.invalid : t.failed)
        return
      }
      setCapture("done")
      if (json.outcome === "dry_run") setNotice(t.preview)
      setMessages((m) => [...m, { role: "assistant", content: json.emailed || json.outcome === "dry_run" ? t.done(name, email) : t.doneNoEmail(name) }])
    } catch {
      setCapture("open")
      setNotice(t.failed)
    }
  }

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="ai-advisor-panel"
        className={`fixed bottom-4 end-4 z-40 flex items-center gap-3 rounded-full border border-border bg-card py-2 ps-2 pe-5 text-sm font-semibold text-card-foreground shadow-lg shadow-black/30 transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:bottom-6 sm:end-6 ${open ? "pointer-events-none opacity-0" : "opacity-100"}`}
      >
        <span className="relative flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Wrench className="size-4" aria-hidden="true" />
          <span className="absolute -end-0.5 -top-0.5 flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex size-3 rounded-full border-2 border-card bg-primary" />
          </span>
        </span>
        {t.launcher}
      </button>

      {open && (
        <section
          id="ai-advisor-panel"
          role="dialog"
          aria-labelledby="ai-advisor-title"
          className="fixed inset-x-3 bottom-3 z-50 flex max-h-[min(42rem,calc(100svh-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl shadow-black/40 sm:inset-x-auto sm:bottom-6 sm:end-6 sm:w-[25rem]"
        >
          <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Wrench className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h2 id="ai-advisor-title" className="text-base font-semibold leading-tight">
                  {t.title}
                </h2>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                  {t.status}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                launcherRef.current?.focus()
              }}
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="size-5" aria-hidden="true" />
              <span className="sr-only">{t.close}</span>
            </button>
          </header>

          <div ref={threadRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4" aria-live="polite">
            <Bubble role="assistant">{t.intro}</Bubble>

            {messages.length === 0 && (
              <div className="flex flex-wrap gap-2">
                {t.suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    className="rounded-full border border-border px-3 py-1.5 text-start text-xs text-foreground transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m, i) =>
              m.content ? (
                <Bubble key={i} role={m.role}>
                  {m.content}
                </Bubble>
              ) : (
                <p key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex gap-1" aria-hidden="true">
                    <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.2s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.1s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-primary" />
                  </span>
                  {t.thinking}
                </p>
              ),
            )}

            {error && <p className="rounded-lg bg-muted px-3 py-2 text-xs text-foreground">{t.error}</p>}

            {(capture === "open" || capture === "sending") && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  submitLead(e.currentTarget)
                }}
                className="flex flex-col gap-3 rounded-xl border border-primary/50 bg-background p-4"
              >
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-semibold">{t.captureTitle}</h3>
                    <p className="text-xs leading-relaxed text-muted-foreground">{t.captureBody}</p>
                  </div>
                </div>
                <Field name="name" label={t.name} autoComplete="name" />
                <Field name="phone" label={t.phone} type="tel" autoComplete="tel" inputMode="tel" placeholder="+971 5X XXX XXXX" />
                <Field name="email" label={t.email} type="email" autoComplete="email" />
                <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
                {notice && <p className="text-xs text-foreground">{notice}</p>}
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={capture === "sending"}
                    className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
                  >
                    {capture === "sending" ? t.sending : t.submit}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCapture("dismissed")
                      setNotice(null)
                    }}
                    className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {t.later}
                  </button>
                </div>
              </form>
            )}

            {capture === "done" && notice && <p className="text-xs text-muted-foreground">{notice}</p>}

            {replies > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {capture !== "done" && capture !== "open" && capture !== "sending" && (
                  <Action onClick={openCapture} icon={<Mail className="size-3.5" aria-hidden="true" />}>
                    {t.emailCta}
                  </Action>
                )}
                <Action href={bookHref} icon={<CalendarCheck className="size-3.5" aria-hidden="true" />}>
                  {t.book}
                </Action>
                {waHref && (
                  <Action href={waHref} external icon={<MessageCircle className="size-3.5" aria-hidden="true" />}>
                    {t.whatsapp}
                  </Action>
                )}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              ask(input)
            }}
            className="border-t border-border px-4 pb-3 pt-3"
          >
            <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-primary">
              <label htmlFor="ai-advisor-input" className="sr-only">
                {t.placeholder}
              </label>
              <textarea
                id="ai-advisor-input"
                ref={inputRef}
                rows={1}
                value={input}
                maxLength={800}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return
                    e.preventDefault()
                    ask(input)
                  }
                }}
                placeholder={t.placeholder}
                className="max-h-28 min-h-6 flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
              >
                <ArrowUp className="size-4" aria-hidden="true" />
                <span className="sr-only">{t.send}</span>
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">{t.disclaimer}</p>
          </form>
        </section>
      )}
    </>
  )
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  return role === "user" ? (
    <p className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-ee-sm bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
      {children}
    </p>
  ) : (
    <p className="max-w-[92%] self-start whitespace-pre-wrap rounded-2xl rounded-es-sm bg-muted px-4 py-2.5 text-sm leading-relaxed text-foreground">
      {children}
    </p>
  )
}

function Field({ name, label, ...rest }: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `ai-advisor-${name}`
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        name={name}
        required
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        {...rest}
      />
    </div>
  )
}

function Action({
  children,
  icon,
  href,
  external,
  onClick,
}: {
  children: React.ReactNode
  icon: React.ReactNode
  href?: string
  external?: boolean
  onClick?: () => void
}) {
  const cls =
    "flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
  if (href) {
    return (
      <a href={href} className={cls} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {icon}
        {children}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {icon}
      {children}
    </button>
  )
}
