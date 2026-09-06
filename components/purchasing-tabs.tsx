"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

type Tab = { href: string; label: string; anyOf: string[] }

// The purchasing hub tabs. Each declares the permissions that reveal it:
// Requests / Suppliers are visible to anyone who can see parts; Orders /
// Supplier Invoices / Payments require purchasing rights.
const TABS: Tab[] = [
  { href: "/parts", label: "Requests", anyOf: ["parts.view"] },
  { href: "/purchasing", label: "Orders", anyOf: ["purchase_orders.manage"] },
  { href: "/purchasing/invoices", label: "Supplier Invoices", anyOf: ["purchase_orders.manage", "parts.view"] },
  { href: "/purchasing/payments", label: "Payments", anyOf: ["purchase_orders.manage"] },
  { href: "/suppliers", label: "Suppliers", anyOf: ["parts.view", "suppliers.view"] },
]

export function PurchasingTabs({ perms }: { perms: string[] }) {
  const pathname = usePathname()
  const has = (anyOf: string[]) => anyOf.some((p) => perms.includes(p))
  const visible = TABS.filter((t) => has(t.anyOf))

  // Longest matching href wins so /purchasing/invoices doesn't also light up /purchasing.
  const activeHref = visible
    .map((t) => t.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0]

  return (
    <nav className="mb-6 flex flex-wrap gap-1.5 border-b border-border pb-3" aria-label="Purchasing sections">
      {visible.map((t) => {
        const active = t.href === activeHref
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
