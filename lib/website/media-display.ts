/** Public image copy; stored CMS provenance remains unchanged. */
const PROVENANCE_CAPTIONS = new Set([
  "Illustrative concept image — not a photograph of the workshop",
  "صورة توضيحية تصورية — ليست صورة فوتوغرافية للورشة",
  "AI-generated illustration based on our workshop concept; not a photograph of a customer vehicle.",
  "صورة توضيحية مولّدة بالذكاء الاصطناعي مستوحاة من تصميم الورشة؛ ليست صورة لسيارة عميل.",
  "Illustrative portrait — real profile coming soon",
  "صورة توضيحية — الملف الحقيقي قريباً",
  "AI-generated illustration",
  "صورة توضيحية مولّدة بالذكاء الاصطناعي",
  "Illustrative image",
  "صورة توضيحية",
])

export function displayImageCaption(value: string, illustrative: boolean): string {
  const normalized = value.trim().replace(/\s+/g, " ")
  return illustrative && PROVENANCE_CAPTIONS.has(normalized) ? "" : value
}

export function displayImageAlt(value: string, fallback: string, illustrative: boolean): string {
  if (!illustrative) return value || fallback
  const description = value
    .replace(/^(?:AI illustration of (?:a )?|Illustration of (?:a )?)/i, "")
    .replace(/^تصوّر بالذكاء الاصطناعي لسيارة\s*/, "سيارة ")
    .replace(/^رسم توضيحي لورشة\s*/, "ورشة ")
  return description || fallback
}
