"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { readConsent, subscribeConsent, subscribeReopen, reopenConsent, writeConsent } from "@/lib/consent"

/** Stable string snapshot so useSyncExternalStore never sees a new object per read. */
function snapshot(): string {
  const c = readConsent()
  return c ? `a${c.analytics ? 1 : 0}d${c.ads ? 1 : 0}` : "unset"
}

/**
 * Shown when the page needs consent and the visitor has not chosen yet, or when
 * they reopen "Privacy choices". Every choice goes through writeConsent, which
 * persists v2 state, clears identifiers on refusal and calls the tag bootstrap.
 */
export function ConsentBanner({ lang, privacyHref }: { lang: "en" | "ar"; privacyHref: string }) {
  const choice = useSyncExternalStore(subscribeConsent, snapshot, () => "pending")
  const [reopened, setReopened] = useState(false)
  useEffect(() => subscribeReopen(() => setReopened(true)), [])

  if (choice === "pending" || (choice !== "unset" && !reopened)) return null
  const ar = lang === "ar"

  const decide = (analytics: boolean, ads: boolean) => {
    writeConsent({ analytics, ads })
    setReopened(false)
  }

  return (
    <div
      role="region"
      aria-label={ar ? "خيارات الخصوصية" : "Privacy choices"}
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-2xl flex-col gap-3 rounded-lg border border-border bg-card p-4 text-sm text-card-foreground shadow-lg sm:flex-row sm:items-center"
    >
      <p className="flex-1 leading-relaxed text-pretty text-muted-foreground">
        {ar
          ? "نستخدم أدوات التحليلات وقياس الإعلانات فقط بعد موافقتك. "
          : "We use analytics and ad measurement only with your consent. "}
        <a href={privacyHref} className="underline underline-offset-2 hover:text-foreground">
          {ar ? "سياسة الخصوصية" : "Privacy policy"}
        </a>
      </p>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button
          type="button"
          onClick={() => decide(false, false)}
          className="h-10 rounded-md border border-border px-4 font-medium text-foreground hover:bg-muted"
        >
          {ar ? "رفض" : "Reject"}
        </button>
        <button
          type="button"
          onClick={() => decide(true, false)}
          className="h-10 rounded-md border border-border px-4 font-medium text-foreground hover:bg-muted"
        >
          {ar ? "التحليلات فقط" : "Analytics only"}
        </button>
        <button
          type="button"
          onClick={() => decide(true, true)}
          className="h-10 rounded-md bg-primary px-4 font-semibold text-primary-foreground hover:opacity-90"
        >
          {ar ? "قبول الكل" : "Accept all"}
        </button>
      </div>
    </div>
  )
}

export function PrivacyChoicesButton({ lang }: { lang: "en" | "ar" }) {
  return (
    <button type="button" onClick={reopenConsent} className="underline-offset-2 hover:text-foreground hover:underline">
      {lang === "ar" ? "خيارات الخصوصية" : "Privacy choices"}
    </button>
  )
}
