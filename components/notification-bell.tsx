"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { usePathname } from "next/navigation"
import useSWR from "swr"
import Link from "next/link"
import { Bell, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { markNotificationRead, markAllNotificationsRead } from "@/lib/actions-notifications"
import { PushToggle } from "@/components/push-toggle"

interface Notif {
  id: string
  title: string
  body: string | null
  type: string
  link: string | null
  read: boolean
  created_at: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const { data, mutate } = useSWR<{ notifications: Notif[]; unread: number }>(
    "/api/notifications",
    fetcher,
    { refreshInterval: 30000 },
  )
  const notifications = data?.notifications ?? []
  const unread = data?.unread ?? 0

  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open])

  async function handleRead(id: string) {
    setOpen(false)
    await markNotificationRead(id)
    mutate()
  }
  async function handleReadAll() {
    await markAllNotificationsRead()
    mutate()
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && mounted && createPortal(
        <>
          {/* Rendered in a body portal: the header's backdrop-blur would otherwise trap fixed overlays on tablets. */}
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[90] bg-background/40"
          />
          <div
            role="dialog"
            aria-label="Notifications"
            className="fixed end-4 top-16 z-[100] flex max-h-[calc(100dvh-5rem)] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
              <span className="text-sm font-semibold">Notifications</span>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button onClick={handleReadAll} className="flex items-center gap-1 px-2 py-2 text-xs text-primary hover:underline">
                    <Check className="h-3 w-3" /> Mark all read
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close notifications"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <PushToggle />
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
              ) : (
                notifications.map((n) => {
                  const inner = (
                    <div
                      className={cn(
                        "flex flex-col gap-0.5 border-b border-border px-4 py-3 transition hover:bg-accent",
                        !n.read && "bg-primary/5",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{n.title}</span>
                        {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                      </div>
                      {n.body && <span className="text-xs text-muted-foreground">{n.body}</span>}
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                    </div>
                  )
                  return n.link ? (
                    <Link key={n.id} href={n.link} onClick={() => handleRead(n.id)}>
                      {inner}
                    </Link>
                  ) : (
                    <button key={n.id} onClick={() => handleRead(n.id)} className="block w-full text-left">
                      {inner}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
