"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CornerDownLeft, FileSearch, Search, Settings2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n/provider"

export type SearchPage = { href: string; label: string; group?: string }

type SearchEntry = {
  href: string
  label: { en: string; ar: string }
  where: { en: string; ar: string }
  keywords: string
  anyOf?: readonly string[]
  ownerOnly?: boolean
}

const SETTINGS = { en: "Settings", ar: "الإعدادات" }

// Individual settings and controls that live inside a page, so people can find
// "where do I change X" without remembering which screen it's on.
const FEATURE_ENTRIES: SearchEntry[] = [
  {
    href: "/settings#pricing",
    label: { en: "Default markup / margin %", ar: "نسبة الربح / الهامش الافتراضية" },
    where: { en: "Settings → Parts pricing & VAT", ar: "الإعدادات ← تسعير القطع والضريبة" },
    keywords: "markup margin profit percent price parts sale selling هامش ربح نسبة سعر",
    anyOf: ["settings.manage"],
  },
  {
    href: "/settings#pricing",
    label: { en: "Pricing method (markup or margin)", ar: "طريقة التسعير" },
    where: { en: "Settings → Parts pricing & VAT", ar: "الإعدادات ← تسعير القطع والضريبة" },
    keywords: "pricing method markup margin cost تسعير هامش",
    anyOf: ["settings.manage"],
  },
  {
    href: "/settings#pricing",
    label: { en: "VAT rate %", ar: "نسبة ضريبة القيمة المضافة" },
    where: { en: "Settings → Parts pricing & VAT", ar: "الإعدادات ← تسعير القطع والضريبة" },
    keywords: "vat tax rate 5% ضريبة",
    anyOf: ["settings.manage"],
  },
  {
    href: "/settings#pricing",
    label: { en: "After customer approves parts (send to purchaser)", ar: "بعد موافقة العميل على القطع" },
    where: { en: "Settings → Parts pricing & VAT", ar: "الإعدادات ← تسعير القطع والضريبة" },
    keywords: "approval purchaser release auto advisor send parts موافقة مشتريات",
    anyOf: ["settings.manage"],
  },
  {
    href: "/settings#defaults",
    label: { en: "Default labour rate (AED/hr)", ar: "سعر ساعة العمل الافتراضي" },
    where: { en: "Settings → Defaults", ar: "الإعدادات ← الافتراضيات" },
    keywords: "labour labor rate hour hourly aed عمل ساعة أجرة",
    anyOf: ["settings.manage"],
  },
  {
    href: "/settings#defaults",
    label: { en: "Quotation validity (days)", ar: "صلاحية عرض السعر" },
    where: { en: "Settings → Defaults", ar: "الإعدادات ← الافتراضيات" },
    keywords: "quotation quote estimate validity expiry days عرض سعر",
    anyOf: ["settings.manage"],
  },
  {
    href: "/settings#identity",
    label: { en: "Company name, Trade License, TRN & logo", ar: "اسم الشركة والرخصة والرقم الضريبي" },
    where: { en: "Settings → Identity", ar: "الإعدادات ← الهوية" },
    keywords: "company name legal trade license trn tax registration logo brand شركة رخصة شعار",
    anyOf: ["settings.manage"],
  },
  {
    href: "/settings#contact",
    label: { en: "Workshop phone, email & website", ar: "هاتف وبريد وموقع الورشة" },
    where: { en: "Settings → Contact", ar: "الإعدادات ← التواصل" },
    keywords: "phone email website contact هاتف بريد موقع",
    anyOf: ["settings.manage"],
  },
  {
    href: "/settings#tracking",
    label: { en: "Customer tracking link expiry", ar: "انتهاء رابط تتبع العميل" },
    where: { en: "Settings → Customer tracking", ar: "الإعدادات ← تتبع العميل" },
    keywords: "tracking link expire expiry delivery تتبع رابط",
    anyOf: ["settings.manage"],
  },
  {
    href: "/purchasing/invoices",
    label: { en: "Markup per line on a scanned supplier invoice", ar: "نسبة الربح لكل بند في فاتورة المورد" },
    where: { en: "Scan Invoice → review lines", ar: "مسح الفاتورة ← مراجعة البنود" },
    keywords: "markup supplier invoice scan line cost sale هامش فاتورة مورد",
    anyOf: ["purchase_orders.manage", "parts.view"],
  },
  {
    href: "/jobs",
    label: { en: "Markup on a manually purchased part", ar: "نسبة الربح لقطعة مشتراة يدوياً" },
    where: { en: "Job Cards → open a job → Parts", ar: "بطاقات العمل ← افتح بطاقة ← القطع" },
    keywords: "markup manual purchase part job هامش قطعة",
    anyOf: ["jobs.view_all", "jobs.view_assigned"],
  },
  {
    href: "/users",
    label: { en: "Roles & permissions", ar: "الأدوار والصلاحيات" },
    where: { en: "Users & Roles", ar: "المستخدمون والأدوار" },
    keywords: "role permission access user staff invite صلاحية دور مستخدم",
    anyOf: ["users.manage", "permissions.manage"],
  },
]

type Result = { key: string; href: string; title: string; subtitle: string; kind: "page" | "setting"; keywords?: string }

function normalize(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[\u064B-\u065F]/g, "")
}

export function CrmSearch({
  pages,
  permissions,
  isOwner,
}: {
  pages: SearchPage[]
  permissions: string[]
  isOwner: boolean
}) {
  const router = useRouter()
  const { lang } = useI18n()
  const isAr = lang === "ar"
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery("")
      setActive(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const allResults = useMemo<Result[]>(() => {
    const perms = new Set(permissions)
    const allowed = (e: SearchEntry) => (e.ownerOnly ? isOwner : !e.anyOf || e.anyOf.some((p) => perms.has(p)))
    const pageResults: Result[] = pages.map((p) => ({
      key: `page:${p.href}`,
      href: p.href,
      title: p.label,
      subtitle: p.group ?? (isAr ? "صفحة" : "Page"),
      kind: "page",
    }))
    const featureResults: Result[] = FEATURE_ENTRIES.filter(allowed).map((e, i) => ({
      key: `feature:${i}`,
      href: e.href,
      title: isAr ? e.label.ar : e.label.en,
      subtitle: isAr ? e.where.ar : e.where.en,
      kind: "setting",
      keywords: `${e.keywords} ${e.label.en} ${e.label.ar} ${e.where.en} ${e.where.ar}`,
    }))
    return [...featureResults, ...pageResults]
  }, [pages, permissions, isOwner, isAr])

  const results = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return allResults.filter((r) => r.kind === "page").slice(0, 8)
    const tokens = q.split(/\s+/)
    return allResults
      .map((r) => {
        const hay = normalize(`${r.title} ${r.subtitle} ${r.keywords ?? ""}`)
        if (!tokens.every((t) => hay.includes(t))) return null
        const titleHit = normalize(r.title).includes(tokens[0]) ? 0 : 1
        return { r, score: titleHit }
      })
      .filter((x): x is { r: Result; score: number } => x !== null)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.r)
      .slice(0, 12)
  }, [query, allResults])

  useEffect(() => setActive(0), [query])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" })
  }, [active])

  const go = (r: Result) => {
    setOpen(false)
    router.push(r.href)
  }

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === "Enter") {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return
      const r = results[active]
      if (r) go(r)
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={isAr ? "بحث في النظام" : "Search CRM"}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card/60 px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Search className="h-4 w-4" />
        <span className="hidden md:inline">{isAr ? "بحث…" : "Search…"}</span>
        <kbd className="hidden rounded border border-border px-1.5 font-mono text-[10px] md:inline">Ctrl K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={isAr ? "بحث في النظام" : "Search CRM"}
            className="relative flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder={isAr ? "ابحث عن صفحة أو إعداد… مثل: هامش الربح" : "Search pages or settings… e.g. markup"}
                className="h-12 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                role="combobox"
                aria-expanded="true"
                aria-controls="crm-search-results"
                aria-activedescendant={results[active] ? `crm-search-${active}` : undefined}
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={isAr ? "إغلاق" : "Close"}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ul ref={listRef} id="crm-search-results" role="listbox" className="flex-1 overflow-y-auto p-2">
              {results.length === 0 ? (
                <li className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {isAr ? "لا توجد نتائج" : "No matches. Try another word."}
                </li>
              ) : (
                results.map((r, i) => {
                  const Icon = r.kind === "setting" ? Settings2 : FileSearch
                  return (
                    <li
                      key={r.key}
                      id={`crm-search-${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(r)}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5",
                        i === active ? "bg-primary text-primary-foreground" : "text-foreground",
                      )}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", i === active ? "" : "text-muted-foreground")} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{r.title}</div>
                        <div
                          className={cn(
                            "truncate text-xs",
                            i === active ? "text-primary-foreground/80" : "text-muted-foreground",
                          )}
                        >
                          {r.subtitle}
                        </div>
                      </div>
                      {i === active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0" />}
                    </li>
                  )
                })
              )}
            </ul>
            {!query && (
              <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                {isAr ? `اكتب للبحث في الصفحات و${SETTINGS.ar}` : `Type to search pages and ${SETTINGS.en.toLowerCase()}`}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
