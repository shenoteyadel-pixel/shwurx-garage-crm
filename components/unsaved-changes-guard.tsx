"use client"

import { useEffect } from "react"

const MESSAGE = "You have unsaved changes. Leave this page and lose them?"

/**
 * Tracks any <form> the user has typed into but not submitted, and warns before
 * the page is closed, reloaded, or left through an in-app link. Forms marked
 * with `data-autosave` save themselves, so they are ignored.
 */
export function UnsavedChangesGuard() {
  useEffect(() => {
    const dirty = new Set<HTMLFormElement>()

    const formOf = (target: EventTarget | null) => {
      const el = target as HTMLElement | null
      const form = el?.closest?.("form")
      if (!form || form.hasAttribute("data-autosave") || form.hasAttribute("data-no-guard")) return null
      return form
    }

    const onInput = (e: Event) => {
      const form = formOf(e.target)
      if (form) dirty.add(form)
    }
    const onSubmit = (e: Event) => {
      const form = e.target as HTMLFormElement
      dirty.delete(form)
    }
    const hasDirty = () => {
      for (const form of dirty) if (!form.isConnected) dirty.delete(form)
      return dirty.size > 0
    }

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasDirty()) return
      e.preventDefault()
      e.returnValue = ""
    }

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const link = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return
      const url = new URL(link.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      if (!hasDirty()) return
      if (window.confirm(MESSAGE)) {
        dirty.clear()
        return
      }
      e.preventDefault()
      e.stopPropagation()
    }

    document.addEventListener("input", onInput, true)
    document.addEventListener("change", onInput, true)
    document.addEventListener("submit", onSubmit, true)
    document.addEventListener("click", onClick, true)
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => {
      document.removeEventListener("input", onInput, true)
      document.removeEventListener("change", onInput, true)
      document.removeEventListener("submit", onSubmit, true)
      document.removeEventListener("click", onClick, true)
      window.removeEventListener("beforeunload", onBeforeUnload)
    }
  }, [])

  return null
}
