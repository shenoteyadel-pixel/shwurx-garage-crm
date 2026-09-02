"use client"

import { useState, useTransition } from "react"
import { Card, Button, Input, Label, Select, Badge } from "@/components/ui"
import { ROLE_LIST, PERMISSION_CATALOG, roleLabel, type Permission, type Role } from "@/lib/rbac/roles"
import { createStaffUser, updateUserRole, setUserActive, setPermissionOverride } from "@/lib/actions-users"
import { UserPlus, Loader2, SlidersHorizontal, X, Check, Ban } from "lucide-react"

interface UserRow {
  id: string
  email: string | null
  full_name: string | null
  role: string
  is_active: boolean
  customer_id: string | null
  created_at: string
}
interface Override {
  user_id: string
  permission: string
  allowed: boolean
}

const STAFF_ROLES = ROLE_LIST.filter((r) => r.staff)

export function UserManagement({
  users,
  overrides,
  currentUserId,
  canManageUsers,
  canManagePerms,
}: {
  users: UserRow[]
  overrides: Override[]
  currentUserId: string
  canManageUsers: boolean
  canManagePerms: boolean
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const staff = users.filter((u) => u.role !== "customer")

  const overrideCount = (userId: string) => overrides.filter((o) => o.user_id === userId).length

  return (
    <div className="flex flex-col gap-4">
      {canManageUsers && (
        <div className="flex justify-end">
          <Button onClick={() => setShowCreate(true)}>
            <UserPlus className="h-4 w-4" /> Add staff user
          </Button>
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Overrides</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {staff.map((u) => (
                <UserRowItem
                  key={u.id}
                  user={u}
                  isSelf={u.id === currentUserId}
                  overrideCount={overrideCount(u.id)}
                  canManageUsers={canManageUsers}
                  canManagePerms={canManagePerms}
                  onEditPerms={() => setEditing(u)}
                />
              ))}
              {staff.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No staff users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {showCreate && <CreateUserDialog onClose={() => setShowCreate(false)} />}
      {editing && (
        <OverridesDialog
          user={editing}
          overrides={overrides.filter((o) => o.user_id === editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function UserRowItem({
  user,
  isSelf,
  overrideCount,
  canManageUsers,
  canManagePerms,
  onEditPerms,
}: {
  user: UserRow
  isSelf: boolean
  overrideCount: number
  canManageUsers: boolean
  canManagePerms: boolean
  onEditPerms: () => void
}) {
  const [pending, start] = useTransition()

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
            {(user.full_name || user.email || "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium">
              {user.full_name || "—"} {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
            </div>
            <div className="truncate text-xs text-muted-foreground">{user.email}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        {canManageUsers ? (
          <Select
            defaultValue={user.role}
            disabled={pending}
            onChange={(e) => start(() => updateUserRole(user.id, e.target.value as Role))}
            className="h-9 w-44"
          >
            {STAFF_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        ) : (
          <Badge>{roleLabel(user.role)}</Badge>
        )}
      </td>
      <td className="px-4 py-3">
        {user.is_active ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400">
            <Check className="h-3 w-3" /> Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
            <Ban className="h-3 w-3" /> Inactive
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        {overrideCount > 0 ? (
          <Badge className="bg-primary/10 text-primary">{overrideCount} custom</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Role default</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          {canManagePerms && (
            <Button variant="ghost" size="sm" onClick={onEditPerms}>
              <SlidersHorizontal className="h-4 w-4" /> Permissions
            </Button>
          )}
          {canManageUsers && !isSelf && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => start(() => setUserActive(user.id, !user.is_active))}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : user.is_active ? (
                "Deactivate"
              ) : (
                "Activate"
              )}
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}

function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <Dialog title="Add staff user" onClose={onClose}>
      <form
        action={(fd) =>
          start(async () => {
            setError(null)
            try {
              await createStaffUser(fd)
              onClose()
            } catch (e) {
              setError((e as Error).message)
            }
          })
        }
        className="flex flex-col gap-4"
      >
        <div>
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" name="full_name" required placeholder="e.g. Ahmed Khan" />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required placeholder="staff@shwurx.com" />
        </div>
        <div>
          <Label htmlFor="password">Temporary password</Label>
          <Input id="password" name="password" type="text" required minLength={8} placeholder="min 8 characters" />
        </div>
        <div>
          <Label htmlFor="role">Role</Label>
          <Select id="role" name="role" defaultValue="service_advisor">
            {STAFF_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Create user
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function OverridesDialog({
  user,
  overrides,
  onClose,
}: {
  user: UserRow
  overrides: Override[]
  onClose: () => void
}) {
  const [pending, start] = useTransition()
  const map = new Map(overrides.map((o) => [o.permission, o.allowed]))

  const state = (perm: Permission): "default" | "allow" | "deny" => {
    if (!map.has(perm)) return "default"
    return map.get(perm) ? "allow" : "deny"
  }

  function cycle(perm: Permission, next: "default" | "allow" | "deny") {
    const allowed = next === "default" ? null : next === "allow"
    start(() => setPermissionOverride(user.id, perm, allowed))
  }

  return (
    <Dialog title={`Permissions · ${user.full_name || user.email}`} onClose={onClose} wide>
      <p className="mb-4 text-sm text-muted-foreground">
        Overrides take priority over the role defaults for <strong>{roleLabel(user.role)}</strong>. Leave as
        &quot;Role default&quot; to inherit.
      </p>
      <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto pr-1">
        {PERMISSION_CATALOG.map((group) => (
          <div key={group.group}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.group}</h3>
            <div className="flex flex-col gap-2">
              {group.perms.map((p) => {
                const s = state(p.key)
                return (
                  <div key={p.key} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                    <span className="text-sm">{p.label}</span>
                    <div className="flex items-center gap-1" role="group" aria-label={p.label}>
                      {(["default", "allow", "deny"] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          disabled={pending}
                          onClick={() => cycle(p.key, opt)}
                          className={triStateClass(s === opt, opt)}
                        >
                          {opt === "default" ? "Default" : opt === "allow" ? "Allow" : "Deny"}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Dialog>
  )
}

function triStateClass(active: boolean, opt: "default" | "allow" | "deny") {
  const base = "rounded-md px-2.5 py-1 text-xs font-medium transition"
  if (!active) return `${base} text-muted-foreground hover:bg-accent`
  if (opt === "allow") return `${base} bg-emerald-500/15 text-emerald-400`
  if (opt === "deny") return `${base} bg-destructive/15 text-destructive`
  return `${base} bg-secondary text-foreground`
}

function Dialog({
  title,
  children,
  onClose,
  wide,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-2xl border border-border bg-card p-6 shadow-2xl`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
