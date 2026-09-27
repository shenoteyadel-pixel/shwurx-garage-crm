"use client"

import { useEffect, useState } from "react"
import { BellRing, BellOff, Smartphone } from "lucide-react"

type Status = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on" | "working"

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}
function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function PushToggle() {
  const [status, setStatus] = useState<Status>("loading")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function check() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setStatus(isIos() && !isStandalone() ? "ios-install" : "unsupported")
        return
      }
      if (Notification.permission === "denied") return setStatus("denied")
      const reg = await navigator.serviceWorker.register("/sw.js")
      const sub = await reg.pushManager.getSubscription()
      if (!cancelled) setStatus(sub ? "on" : "off")
    }
    check().catch(() => !cancelled && setStatus("unsupported"))
    return () => {
      cancelled = true
    }
  }, [])

  async function enable() {
    setError(null)
    setStatus("working")
    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") return setStatus(permission === "denied" ? "denied" : "off")
      const reg = await navigator.serviceWorker.register("/sw.js")
      await navigator.serviceWorker.ready
      const { publicKey } = await fetch("/api/push").then((r) => r.json())
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }))
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sub.toJSON(), test: true }),
      })
      if (!res.ok) throw new Error("save failed")
      setStatus("on")
    } catch {
      setError("Could not turn on notifications. Try again.")
      setStatus("off")
    }
  }

  async function disable() {
    setStatus("working")
    const reg = await navigator.serviceWorker.getRegistration("/sw.js")
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      await fetch("/api/push", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      })
      await sub.unsubscribe()
    }
    setStatus("off")
  }

  if (status === "loading") return null

  return (
    <div className="flex flex-col gap-1 border-b border-border px-4 py-3">
      {status === "on" && (
        <button onClick={disable} className="flex items-center gap-2 text-left text-xs text-muted-foreground hover:text-foreground">
          <BellRing className="h-4 w-4 text-primary" />
          <span>Phone alerts are on for this device. Tap to turn off.</span>
        </button>
      )}
      {(status === "off" || status === "working") && (
        <button
          onClick={enable}
          disabled={status === "working"}
          className="flex h-9 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          <Smartphone className="h-4 w-4" />
          {status === "working" ? "Turning on..." : "Get alerts on this phone"}
        </button>
      )}
      {status === "ios-install" && (
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            On iPhone: tap Share, then &quot;Add to Home Screen&quot;. Open WURX from the home screen, then turn on alerts here.
          </span>
        </p>
      )}
      {status === "denied" && (
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <BellOff className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Notifications are blocked. Allow them for this site in your phone settings.</span>
        </p>
      )}
      {status === "unsupported" && (
        <p className="text-xs text-muted-foreground">This browser does not support phone alerts.</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
