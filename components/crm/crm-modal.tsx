"use client"

import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"

let scrollLocks = 0

function lockScroll() {
  scrollLocks += 1
  if (scrollLocks === 1) document.body.style.overflow = "hidden"
}

function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1)
  if (scrollLocks === 0) document.body.style.removeProperty("overflow")
}

export function CrmModal({
  open,
  onClose,
  title,
  description,
  icon,
  closeLabel,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  icon?: React.ReactNode
  closeLabel: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => setMounted(true), [])

  // Depends only on `open` so parent re-renders (e.g. SWR refreshes) never steal focus or re-lock scrolling.
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current()
    document.addEventListener("keydown", onKey)
    lockScroll()
    return () => {
      document.removeEventListener("keydown", onKey)
      unlockScroll()
      previous?.focus?.({ preventScroll: true })
    }
  }, [open])

  if (!open || !mounted) return null

  // Portaled to <body>: the sticky header uses backdrop-blur, which would otherwise become the containing
  // block for `fixed` and push the dialog (and its close button) off-screen on tablets.
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={() => onCloseRef.current()} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-card text-card-foreground shadow-2xl outline-none sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-start gap-3 border-b border-border p-5">
          {icon}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-pretty text-lg font-semibold leading-snug">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>}
          </div>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            aria-label={closeLabel}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border bg-background/40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
