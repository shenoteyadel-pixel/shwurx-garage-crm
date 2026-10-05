"use client"

import { useSyncExternalStore } from "react"

const KEY = "shwurx_consent_v1"
const listeners = new Set<() => void>()

function read(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function decide(choice: "granted" | "denied") {
  try {
    localStorage.setItem(KEY, choice)
  } catch {
    /* private mode: the choice applies to this page only */
  }
  const w = window as Window & { fbq?: (...a: unknown[]) => void }
  w.gtag?.("consent", "update", {
    ad_storage: choice,
    ad_user_data: choice,
    ad_personalization: choice,
    analytics_storage: choice,
  })
  w.fbq?.("consent", choice === "granted" ? "grant" : "revoke")
  listeners.forEach((l) => l())
}

/** Shown only when third-party tags are configured and the visitor has not chosen yet. */
export function ConsentBanner({ lang, privacyHref }: { lang: "en" | "ar"; privacyHref: string }) {
  const choice = useSyncExternalStore(subscribe, read, () => "pending")
  if (choice) return null
  const ar = lang === "ar"
  return (
    <div
      role="region"
      aria-label={ar ? "موافقة ملفات تعريف الارتباط" : "Cookie consent"}
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-2xl flex-col gap-3 rounded-lg border border-border bg-card p-4 text-sm text-card-foreground shadow-lg sm:flex-row sm:items-center"
    >
      <p className="flex-1 leading-relaxed text-pretty text-muted-foreground">
        {ar
          ? "نستخدم ملفات تعريف الارتباط للتحليلات وقياس الإعلانات فقط بعد موافقتك. "
          : "We use cookies for analytics and ad measurement only with your consent. "}
        <a href={privacyHref} className="underline underline-offset-2 hover:text-foreground">
          {ar ? "سياسة الخصوصية" : "Privacy policy"}
        </a>
      </p>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => decide("denied")}
          className="h-10 rounded-md border border-border px-4 font-medium text-foreground hover:bg-muted"
        >
          {ar ? "رفض" : "Decline"}
        </button>
        <button
          type="button"
          onClick={() => decide("granted")}
          className="h-10 rounded-md bg-primary px-4 font-semibold text-primary-foreground hover:opacity-90"
        >
          {ar ? "قبول" : "Accept"}
        </button>
      </div>
    </div>
  )
}
