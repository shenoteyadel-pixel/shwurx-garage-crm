"use client"

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { Bell, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { markNotificationRead, markAllNotificationsRead } from "@/lib/actions-notifications"

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
  const { data, mutate } = useSWR<{ notifications: Notif[]; unread: number }>(
    "/api/notifications",
    fetcher,
    { refreshInterval: 30000 },
  )
  const notifications = data?.notifications ?? []
  const unread = data?.unread ?? 0

  async function handleRead(id: string) {
    await markNotificationRead(id)
    mutate()
  }
  async function handleReadAll() {
    await markAllNotificationsRead()
    mutate()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
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

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-semibold">Notifications</span>
              {unread > 0 && (
                <button onClick={handleReadAll} className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <Check className="h-3 w-3" /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
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
        </>
      )}
    </div>
  )
}
