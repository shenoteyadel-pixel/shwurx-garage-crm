"use client"

import { useState, useTransition, useRef } from "react"
import { Card, Button, Input, Label, Select, Badge, Combo } from "@/components/ui"
import {
  ROLE_LIST,
  PERMISSION_CATALOG,
  roleLabel,
  inviteStatusMeta,
  type Permission,
  type Role,
} from "@/lib/rbac/roles"
import {
  DEPARTMENTS,
  departmentLabel,
  JOB_TITLE_SUGGESTIONS,
} from "@/lib/rbac/catalog"
import {
  inviteStaffUser,
  resendStaffInvite,
  sendPasswordReset,
  updateUserRole,
  setUserActive,
  setPermissionOverride,
  forceLogoutUser,
  searchExistingUsers,
  updateStaffProfile,
  deleteStaffUser,
  getLoginLink,
  type CredentialLinkResult,
  type DuplicateMatch,
} from "@/lib/actions-users"
import { CredentialLinkPanel } from "@/components/admin/credential-link-panel"
import { SkillsPicker } from "@/components/admin/skills-picker"
import {
  UserPlus,
  Loader2,
  SlidersHorizontal,
  X,
  Check,
  Ban,
  KeyRound,
  Send,
  LogOut,
  AlertTriangle,
  Clock,
  Trash2,
  Pencil,
  Copy,
} from "lucide-react"

interface UserRow {
  id: string
  email: string | null
  full_name: string | null
  role: string
  is_active: boolean
  customer_id: string | null
  created_at: string
  phone?: string | null
  mobile?: string | null
  must_set_password?: boolean
  department?: string | null
  branch?: string | null
  employee_id?: string | null
  job_title?: string | null
  skills?: string[] | null
  invite_status?: string | null
  invite_sent_at?: string | null
  invite_error?: string | null
  last_login_at?: string | null
}
interface Override {
  user_id: string
  permission: string
  allowed: boolean
}

const STAFF_ROLES = ROLE_LIST.filter((r) => r.staff && r.value !== "owner")
const ALL_STAFF_ROLES = ROLE_LIST.filter((r) => r.staff)

const TONE_CLASS: Record<string, string> = {
  muted: "bg-secondary text-muted-foreground",
  amber: "bg-amber-500/10 text-amber-400",
  destructive: "bg-destructive/10 text-destructive",
  sky: "bg-sky-500/10 text-sky-400",
  emerald: "bg-emerald-500/10 text-emerald-400",
}

function fmtDate(v?: string | null) {
  if (!v) return "—"
  return new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
}

export function UserManagement({
  users,
  overrides,
  currentUserId,
  canManageUsers,
  canManagePerms,
  isOwner = false,
}: {
  users: UserRow[]
  overrides: Override[]
  currentUserId: string
  canManageUsers: boolean
  canManagePerms: boolean
  isOwner?: boolean
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [profileEditing, setProfileEditing] = useState<UserRow | null>(null)
  const [deleting, setDeleting] = useState<UserRow | null>(null)
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "error" } | null>(null)
  const [cred, setCred] = useState<{ result: CredentialLinkResult; purpose: "invite" | "reset"; phone?: string | null } | null>(
    null,
  )

  function showToast(msg: string, tone: "ok" | "error" = "ok") {
    setToast({ msg, tone })
    window.setTimeout(() => setToast(null), 2600)
  }

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
                <th className="px-4 py-3 font-medium">Account status</th>
                <th className="px-4 py-3 font-medium">Last login</th>
                <th className="px-4 py-3 font-medium">Overrides</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRowItem
                  key={u.id}
                  user={u}
                  isSelf={u.id === currentUserId}
                  isOwner={isOwner}
                  overrideCount={overrideCount(u.id)}
                  canManageUsers={canManageUsers}
                  canManagePerms={canManagePerms}
                  onEditPerms={() => setEditing(u)}
                  onEditProfile={() => setProfileEditing(u)}
                  onDelete={() => setDeleting(u)}
                  onCredential={(result, purpose, phone) => setCred({ result, purpose, phone })}
                  onToast={showToast}
                />
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No staff users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {showCreate && (
        <CreateUserDialog
          onClose={() => setShowCreate(false)}
          onInvited={(result, phone) => {
            setShowCreate(false)
            setCred({ result, purpose: "invite", phone })
          }}
        />
      )}
      {editing && (
        <OverridesDialog
          user={editing}
          overrides={overrides.filter((o) => o.user_id === editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
      {profileEditing && (
        <EditProfileDialog
          user={profileEditing}
          onClose={() => setProfileEditing(null)}
          onSaved={() => {
            setProfileEditing(null)
            showToast("Profile updated")
          }}
        />
      )}
      {deleting && (
        <DeleteUserDialog
          user={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null)
            showToast("User deleted")
          }}
        />
      )}
      {cred && (
        <Dialog title={cred.purpose === "invite" ? "Account created" : "Reset link ready"} onClose={() => setCred(null)}>
          <CredentialLinkPanel result={cred.result} purpose={cred.purpose} phone={cred.phone} />
          <div className="mt-5 flex justify-end">
            <Button onClick={() => setCred(null)}>Done</Button>
          </div>
        </Dialog>
      )}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-xl ${
            toast.tone === "ok" ? "bg-foreground text-background" : "bg-destructive text-destructive-foreground"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ user }: { user: UserRow }) {
  if (!user.is_active) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${TONE_CLASS.destructive}`}>
        <Ban className="h-3 w-3" /> Deactivated
      </span>
    )
  }
  const meta = inviteStatusMeta(user.invite_status)
  const Icon = meta.tone === "emerald" ? Check : meta.tone === "destructive" ? AlertTriangle : KeyRound
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${TONE_CLASS[meta.tone]}`}
      title={meta.description}
    >
      <Icon className="h-3 w-3" /> {meta.label}
    </span>
  )
}

function UserRowItem({
  user,
  isSelf,
  isOwner,
  overrideCount,
  canManageUsers,
  canManagePerms,
  onEditPerms,
  onEditProfile,
  onDelete,
  onCredential,
  onToast,
}: {
  user: UserRow
  isSelf: boolean
  isOwner: boolean
  overrideCount: number
  canManageUsers: boolean
  canManagePerms: boolean
  onEditPerms: () => void
  onEditProfile: () => void
  onDelete: () => void
  onCredential: (r: CredentialLinkResult, purpose: "invite" | "reset", phone?: string | null) => void
  onToast: (msg: string, tone?: "ok" | "error") => void
}) {
  const [pending, start] = useTransition()
  const [credPending, startCred] = useTransition()
  const [linkPending, startLink] = useTransition()
  const [menuOpen, setMenuOpen] = useState(false)
  const phone = user.mobile ?? user.phone
  const needsSetup = user.must_set_password || user.invite_status === "invited" || user.invite_status === "email_failed"

  // Copy a freshly generated login/setup link straight to the clipboard.
  function copyLoginLink() {
    setMenuOpen(false)
    startLink(async () => {
      try {
        const r = await getLoginLink(user.id, needsSetup ? "set" : "reset")
        await navigator.clipboard.writeText(r.link).catch(() => {})
        onToast("Login link copied to clipboard")
      } catch (e) {
        onToast((e as Error).message, "error")
      }
    })
  }

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
            {user.job_title && <div className="truncate text-xs font-medium text-foreground/80">{user.job_title}</div>}
            {(user.department || user.employee_id || user.branch) && (
              <div className="truncate text-xs text-muted-foreground">
                {[user.employee_id, departmentLabel(user.department), user.branch].filter(Boolean).join(" · ")}
              </div>
            )}
            {user.skills && user.skills.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {user.skills.slice(0, 3).map((s) => (
                  <span key={s} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {s}
                  </span>
                ))}
                {user.skills.length > 3 && (
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    +{user.skills.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        {canManageUsers && !isSelf ? (
          <Select
            defaultValue={user.role}
            disabled={pending}
            onChange={(e) => start(() => updateUserRole(user.id, e.target.value as Role))}
            className="h-9 w-44"
          >
            {ALL_STAFF_ROLES.map((r) => (
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
        <StatusBadge user={user} />
        {user.invite_status === "email_failed" && user.invite_error && (
          <div className="mt-1 max-w-[180px] truncate text-xs text-destructive" title={user.invite_error}>
            {user.invite_error}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" /> {fmtDate(user.last_login_at)}
        </span>
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
          {canManageUsers &&
            (needsSetup ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={credPending}
                onClick={() =>
                  startCred(async () => {
                    const r = await resendStaffInvite(user.id)
                    onCredential(r, "invite", phone)
                  })
                }
              >
                {credPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Resend invite
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                disabled={credPending}
                onClick={() =>
                  startCred(async () => {
                    const r = await sendPasswordReset(user.id)
                    onCredential(r, "reset", phone)
                  })
                }
              >
                {credPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Reset
                password
              </Button>
            ))}
          {canManagePerms && (
            <Button variant="ghost" size="sm" onClick={onEditPerms}>
              <SlidersHorizontal className="h-4 w-4" /> Permissions
            </Button>
          )}
          {canManageUsers && !isSelf && (
            <div className="relative">
              <Button variant="ghost" size="sm" onClick={() => setMenuOpen((v) => !v)} aria-label="More actions">
                •••
              </Button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
                  <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-lg border border-border bg-card shadow-xl">
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
                      onClick={() => {
                        setMenuOpen(false)
                        onEditProfile()
                      }}
                    >
                      <Pencil className="h-4 w-4" /> Edit profile
                    </button>
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
                      disabled={linkPending}
                      onClick={copyLoginLink}
                    >
                      {linkPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />} Copy login
                      link
                    </button>
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
                      disabled={pending}
                      onClick={() => {
                        setMenuOpen(false)
                        start(() => forceLogoutUser(user.id))
                      }}
                    >
                      <LogOut className="h-4 w-4" /> Force logout
                    </button>
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
                      disabled={pending}
                      onClick={() => {
                        setMenuOpen(false)
                        start(() => setUserActive(user.id, !user.is_active))
                      }}
                    >
                      {user.is_active ? (
                        <>
                          <Ban className="h-4 w-4" /> Deactivate
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4" /> Activate
                        </>
                      )}
                    </button>
                    {isOwner && (
                      <button
                        className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          setMenuOpen(false)
                          onDelete()
                        }}
                      >
                        <Trash2 className="h-4 w-4" /> Delete user
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

/* ---------------- Add / invite staff user ---------------- */

function CreateUserDialog({
  onClose,
  onInvited,
}: {
  onClose: () => void
  onInvited: (result: CredentialLinkResult, phone?: string | null) => void
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [dupes, setDupes] = useState<DuplicateMatch[]>([])
  const [checking, setChecking] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  // Live duplicate pre-check on blur of the identifying fields.
  function runDuplicateCheck() {
    const fd = new FormData(formRef.current!)
    const email = String(fd.get("email") || "").trim()
    const mobile = String(fd.get("mobile") || "").trim()
    const employeeId = String(fd.get("employee_id") || "").trim()
    if (!email && !mobile && !employeeId) {
      setDupes([])
      return
    }
    setChecking(true)
    searchExistingUsers({ email, mobile, employeeId })
      .then((m) => {
        setDupes(m)
        if (m.length === 0) setAcknowledged(false)
      })
      .catch(() => setDupes([]))
      .finally(() => setChecking(false))
  }

  const blocked = dupes.length > 0 && !acknowledged

  return (
    <Dialog title="Add staff user" onClose={onClose} wide>
      <p className="mb-4 text-sm text-muted-foreground">
        Create the account and generate a secure set-password link. No password is set here — the user chooses their
        own. The link is emailed automatically and also shown for manual sharing.
      </p>
      <form
        ref={formRef}
        action={(fd) =>
          start(async () => {
            setError(null)
            if (blocked) fd.set("allow_duplicate", "false")
            else if (dupes.length > 0) fd.set("allow_duplicate", "true")
            try {
              const result = await inviteStaffUser(fd)
              onInvited(result, String(fd.get("mobile") || ""))
            } catch (e) {
              setError((e as Error).message)
            }
          })
        }
        className="flex flex-col gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="full_name">Full name *</Label>
            <Input id="full_name" name="full_name" required placeholder="e.g. Ahmed Khan" />
          </div>
          <div>
            <Label htmlFor="role">Role (access level) *</Label>
            <Select id="role" name="role" defaultValue="reception">
              {STAFF_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">Controls what the user can access in the system.</p>
          </div>
          <div>
            <Label htmlFor="job_title">Job title</Label>
            <Combo
              id="job_title"
              name="job_title"
              options={JOB_TITLE_SUGGESTIONS}
              placeholder="e.g. Senior Technician"
            />
            <p className="mt-1 text-xs text-muted-foreground">Their real-world position — pick one or type your own.</p>
          </div>
          <div>
            <Label htmlFor="email">Email *</Label>
            <Input id="email" name="email" type="email" required placeholder="staff@shwurx.com" onBlur={runDuplicateCheck} />
          </div>
          <div>
            <Label htmlFor="mobile">Mobile (for WhatsApp share)</Label>
            <Input id="mobile" name="mobile" placeholder="+971 50 000 0000" onBlur={runDuplicateCheck} />
          </div>
          <div>
            <Label htmlFor="department">Department</Label>
            <Select id="department" name="department" defaultValue="">
              <option value="">— Select —</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="employee_id">Employee ID</Label>
            <Input id="employee_id" name="employee_id" placeholder="e.g. SG-014" onBlur={runDuplicateCheck} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="branch">Branch / Location</Label>
            <Input id="branch" name="branch" placeholder="e.g. Al Quoz" />
          </div>
          <div className="sm:col-span-2">
            <Label>Skills / specializations</Label>
            <SkillsPicker />
            <p className="mt-1 text-xs text-muted-foreground">
              Used to match technicians to the right jobs. Optional.
            </p>
          </div>
        </div>

        {checking && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking for existing staff…
          </p>
        )}

        {dupes.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-amber-400">
              <AlertTriangle className="h-4 w-4" /> Possible duplicate{dupes.length > 1 ? "s" : ""} found
            </p>
            <ul className="mb-2 space-y-1 text-xs text-foreground">
              {dupes.map((d) => (
                <li key={d.id}>
                  <span className="font-medium">{d.full_name || d.email}</span> — {roleLabel(d.role)} (matches {d.match_on})
                </li>
              ))}
            </ul>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
              Invite anyway — this is a different person
            </label>
          </div>
        )}

        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || blocked}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Create &amp; generate link
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/* ---------------- Permission overrides ---------------- */

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

/* ---------------- Edit staff profile ---------------- */

function EditProfileDialog({
  user,
  onClose,
  onSaved,
}: {
  user: UserRow
  onClose: () => void
  onSaved: () => void
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <Dialog title={`Edit profile · ${user.full_name || user.email}`} onClose={onClose} wide>
      <p className="mb-4 text-sm text-muted-foreground">
        Update HR details. Role and permissions are managed separately from the row actions.
      </p>
      <form
        action={(fd) =>
          start(async () => {
            setError(null)
            try {
              await updateStaffProfile(user.id, fd)
              onSaved()
            } catch (e) {
              setError((e as Error).message)
            }
          })
        }
        className="flex flex-col gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="ep_full_name">Full name *</Label>
            <Input id="ep_full_name" name="full_name" required defaultValue={user.full_name ?? ""} />
          </div>
          <div>
            <Label htmlFor="ep_job_title">Job title</Label>
            <Combo
              id="ep_job_title"
              name="job_title"
              options={JOB_TITLE_SUGGESTIONS}
              defaultValue={user.job_title ?? ""}
              placeholder="e.g. Senior Technician"
            />
          </div>
          <div>
            <Label htmlFor="ep_mobile">Mobile</Label>
            <Input id="ep_mobile" name="mobile" defaultValue={user.mobile ?? user.phone ?? ""} placeholder="+971 50 000 0000" />
          </div>
          <div>
            <Label htmlFor="ep_department">Department</Label>
            <Select id="ep_department" name="department" defaultValue={user.department ?? ""}>
              <option value="">— Select —</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ep_employee_id">Employee ID</Label>
            <Input id="ep_employee_id" name="employee_id" defaultValue={user.employee_id ?? ""} placeholder="e.g. SG-014" />
          </div>
          <div>
            <Label htmlFor="ep_branch">Branch / Location</Label>
            <Input id="ep_branch" name="branch" defaultValue={user.branch ?? ""} placeholder="e.g. Al Quoz" />
          </div>
          <div className="sm:col-span-2">
            <Label>Skills / specializations</Label>
            <SkillsPicker defaultValue={user.skills ?? []} />
          </div>
        </div>

        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/* ---------------- Delete staff user ---------------- */

function DeleteUserDialog({
  user,
  onClose,
  onDeleted,
}: {
  user: UserRow
  onClose: () => void
  onDeleted: () => void
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState("")
  const target = user.full_name || user.email || "this user"
  const canDelete = confirmText.trim().toUpperCase() === "DELETE"

  return (
    <Dialog title="Delete staff user" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-medium text-foreground">
              This permanently deletes {target}&apos;s account.
            </p>
            <p className="mt-1 text-muted-foreground">
              Their sign-in is removed immediately and any active job assignments are unassigned. Past job cards keep
              their name for history and are not deleted.
            </p>
          </div>
        </div>

        <div>
          <Label htmlFor="del_confirm">
            Type <span className="font-mono font-semibold text-foreground">DELETE</span> to confirm
          </Label>
          <Input
            id="del_confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
          />
        </div>

        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={!canDelete || pending}
            onClick={() =>
              start(async () => {
                setError(null)
                try {
                  await deleteStaffUser(user.id)
                  onDeleted()
                } catch (e) {
                  setError((e as Error).message)
                }
              })
            }
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete permanently
          </Button>
        </div>
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
