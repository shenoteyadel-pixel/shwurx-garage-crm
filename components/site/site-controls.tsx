"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Sun, Moon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n/provider"
import type { Locale } from "@/lib/i18n/config"

function Segment({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        "inline-flex min-w-8 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-card/60 p-0.5">
      {children}
    </div>
  )
}

export function LanguageToggle() {
  const { lang, setLang, dict } = useI18n()
  const set = (l: Locale) => () => setLang(l)
  return (
    <Group>
      <Segment active={lang === "en"} onClick={set("en")} label={dict.controls.english}>
        EN
      </Segment>
      <Segment active={lang === "ar"} onClick={set("ar")} label={dict.controls.arabic}>
        عربي
      </Segment>
    </Group>
  )
}

export function AppearanceToggle() {
  const { dict } = useI18n()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  // Before mount, next-themes can't know the resolved theme; render a neutral
  // placeholder with the same footprint to avoid a hydration mismatch.
  const isDark = mounted ? resolvedTheme === "dark" : true

  return (
    <Group>
      <Segment active={mounted && !isDark} onClick={() => setTheme("light")} label={dict.controls.light}>
        <Sun className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{dict.controls.light}</span>
      </Segment>
      <Segment active={mounted && isDark} onClick={() => setTheme("dark")} label={dict.controls.dark}>
        <Moon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{dict.controls.dark}</span>
      </Segment>
    </Group>
  )
}

/** Inline controls for the desktop header. */
export function SiteControls({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LanguageToggle />
      <AppearanceToggle />
    </div>
  )
}

/** Full-width labelled controls for the mobile menu. */
export function SiteControlsStacked() {
  const { dict } = useI18n()
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {dict.controls.language}
        </span>
        <LanguageToggle />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {dict.controls.appearance}
        </span>
        <AppearanceToggle />
      </div>
    </div>
  )
}
