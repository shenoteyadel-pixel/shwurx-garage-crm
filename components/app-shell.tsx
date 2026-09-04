"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { signOut } from "@/lib/actions"
import { NotificationBell } from "@/components/notification-bell"
import {
  LayoutDashboard,
  Package,
  Plus,
  Wrench,
  LogOut,
  Menu,
  X,
  Car,
  Workflow,
  Truck,
  Warehouse,
  ShoppingCart,
  FileText,
  BarChart3,
  Settings,
  Users,
  ShieldCheck,
  CalendarClock,
} from "lucide-react"

// Each item declares the permissions that reveal it. `anyOf` = show when the
// user has at least one. Items with no perms are shown to all staff.
const NAV = [
  { href: "/crm", label: "Dashboard", icon: LayoutDashboard },
  { href: "/flow", label: "Car Flow", icon: Workflow, anyOf: ["jobs.view_all"] },
  { href: "/jobs", label: "Job Cards", icon: Car, anyOf: ["jobs.view_all", "jobs.view_assigned"] },
  { href: "/appointments", label: "Appointments", icon: CalendarClock, anyOf: ["appointments.view"] },
  { href: "/customers", label: "Customers", icon: Users, anyOf: ["customers.view"] },
  { href: "/invoices", label: "Invoices", icon: FileText, anyOf: ["invoices.view"] },
  { href: "/parts", label: "Parts", icon: Package, anyOf: ["parts.view"] },
  { href: "/purchasing", label: "Purchasing", icon: ShoppingCart, anyOf: ["purchase_orders.manage", "parts.view"] },
  { href: "/inventory", label: "Store / Inventory", icon: Warehouse, anyOf: ["parts.view"] },
  { href: "/suppliers", label: "Suppliers", icon: Truck, anyOf: ["parts.view"] },
  { href: "/reports", label: "Reports", icon: BarChart3, anyOf: ["reports.view"] },
  { href: "/users", label: "Users & Roles", icon: ShieldCheck, anyOf: ["users.manage", "permissions.manage"] },
  { href: "/settings", label: "Settings", icon: Settings, anyOf: ["settings.manage"] },
] as const

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode
  user: { name: string; role: string; permissions?: string[] }
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const perms = new Set(user.permissions ?? [])
  const has = (anyOf?: readonly string[]) => !anyOf || anyOf.some((p) => perms.has(p))
  const canCreateJob = perms.has("jobs.create")
  const visibleNav = NAV.filter((item) => has((item as { anyOf?: readonly string[] }).anyOf))

  const nav = (
    <nav className="flex flex-col gap-1">
      {visibleNav.map((item) => {
        const active = item.href === "/crm" ? pathname === "/crm" : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <item.icon className="h-4.5 w-4.5" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )

  return (
    <div className="flex min-h-svh bg-background">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-border bg-card/40 p-4 lg:flex">
        <Brand />
        <div className="mt-6 flex-1">{nav}</div>
        <UserFooter user={user} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <Brand />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6 flex-1">{nav}</div>
            <UserFooter user={user} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur lg:px-8">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="text-muted-foreground lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="lg:hidden">
            <Brand compact />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <NotificationBell />
            {canCreateJob && (
              <Link
                href="/jobs/new"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> New Job Card
              </Link>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  )
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <Link href="/crm" className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
        <Wrench className="h-5 w-5 text-primary-foreground" />
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-tight">
            SHWURX <span className="text-primary">Garage</span>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Workshop CRM</div>
        </div>
      )}
    </Link>
  )
}

function UserFooter({ user }: { user: { name: string; role: string } }) {
  return (
    <div className="mt-4 flex items-center gap-3 rounded-lg border border-border p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
        {user.name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{user.name}</div>
        <div className="truncate text-xs capitalize text-muted-foreground">{user.role}</div>
      </div>
      <form action={signOut}>
        <button aria-label="Sign out" className="text-muted-foreground hover:text-foreground" title="Sign out">
          <LogOut className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}
