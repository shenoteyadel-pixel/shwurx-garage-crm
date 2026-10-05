"use client"

import { FlaskConical } from "lucide-react"
import { useI18n } from "@/lib/i18n/provider"

const COPY = {
  en: {
    title: "Test mode: nothing was sent",
    body: "Your details passed validation, but this is a preview deployment. No request was created and nobody will contact you. Use the live website to send a real request.",
  },
  ar: {
    title: "وضع الاختبار: لم يتم إرسال أي شيء",
    body: "تم التحقق من بياناتك، لكن هذه نسخة معاينة. لم يُنشأ أي طلب ولن يتواصل معك أحد. استخدم الموقع المباشر لإرسال طلب حقيقي.",
  },
} as const

/** Shown on a dry-run validation. Deliberately makes no contact promise. */
export function DryRunNotice() {
  const { lang } = useI18n()
  const c = COPY[lang === "ar" ? "ar" : "en"]
  return (
    <div role="status" className="mt-4 flex gap-3 rounded-lg border border-border bg-muted px-3 py-3 text-sm">
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div>
        <p className="font-semibold text-foreground">{c.title}</p>
        <p className="mt-1 leading-relaxed text-muted-foreground">{c.body}</p>
      </div>
    </div>
  )
}
