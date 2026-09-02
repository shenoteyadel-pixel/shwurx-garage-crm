"use client"

import { useState, useTransition } from "react"
import { Card } from "@/components/ui"
import { PERMISSION_CATALOG, ROLE_LIST, type Permission, type Role } from "@/lib/rbac/roles"
import { setRolePermission } from "@/lib/actions-users"
import { Check, Loader2 } from "lucide-react"

interface Row {
  role: string
  permission: string
  allowed: boolean
}

// Owner is implicitly all-powerful and not editable.
const EDITABLE_ROLES = ROLE_LIST.filter((r) => r.staff && r.value !== "owner")

export function PermissionMatrix({ rows }: { rows: Row[] }) {
  const [state, setState] = useState<Map<string, boolean>>(
    () => new Map(rows.map((r) => [`${r.role}:${r.permission}`, r.allowed])),
  )
  const [pending, start] = useTransition()
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const isOn = (role: Role, perm: Permission) => state.get(`${role}:${perm}`) ?? false

  function toggle(role: Role, perm: Permission) {
    const key = `${role}:${perm}`
    const next = !isOn(role, perm)
    setState((prev) => new Map(prev).set(key, next))
    setSavingKey(key)
    start(async () => {
      try {
        await setRolePermission(role, perm, next)
      } catch {
        // revert on failure
        setState((prev) => new Map(prev).set(key, !next))
      } finally {
        setSavingKey(null)
      }
    })
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Permission
              </th>
              {EDITABLE_ROLES.map((r) => (
                <th key={r.value} className="px-3 py-3 text-center text-xs font-medium">
                  <span className="block whitespace-nowrap">{r.label.split(" / ")[0]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_CATALOG.map((group) => (
              <FragmentGroup
                key={group.group}
                group={group}
                roles={EDITABLE_ROLES.map((r) => r.value)}
                isOn={isOn}
                toggle={toggle}
                pending={pending}
                savingKey={savingKey}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function FragmentGroup({
  group,
  roles,
  isOn,
  toggle,
  pending,
  savingKey,
}: {
  group: (typeof PERMISSION_CATALOG)[number]
  roles: Role[]
  isOn: (role: Role, perm: Permission) => boolean
  toggle: (role: Role, perm: Permission) => void
  pending: boolean
  savingKey: string | null
}) {
  return (
    <>
      <tr className="bg-secondary/40">
        <td colSpan={roles.length + 1} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {group.group}
        </td>
      </tr>
      {group.perms.map((p) => (
        <tr key={p.key} className="border-b border-border last:border-0">
          <td className="sticky left-0 z-10 bg-card px-4 py-2.5 text-left">{p.label}</td>
          {roles.map((role) => {
            const on = isOn(role, p.key)
            const key = `${role}:${p.key}`
            const saving = pending && savingKey === key
            return (
              <td key={role} className="px-3 py-2.5 text-center">
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${p.label} for ${role}`}
                  onClick={() => toggle(role, p.key)}
                  className={[
                    "inline-flex h-6 w-6 items-center justify-center rounded-md border transition",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-transparent text-transparent hover:border-primary/50",
                  ].join(" ")}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground" /> : <Check className="h-3.5 w-3.5" />}
                </button>
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}
