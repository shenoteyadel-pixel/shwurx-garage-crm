"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button, Card, Input, Label, Select } from "@/components/ui"
import { createWorkOverride, revokeWorkOverride } from "@/lib/actions-work-authorization"
import { WORK_SCOPE_LABELS, OVERRIDE_HOURS, type WorkScope } from "@/lib/work-authorization-rules"
import { ShieldAlert } from "lucide-react"

export type OverrideView = {
  id: string
  scope: WorkScope
  reason: string
  authorized_by_name: string | null
  created_at: string
  expires_at: string
  revoked_at: string | null
}

export function WorkOverridePanel({
  jobId,
  approved,
  overrides,
  canAuthorize,
}: {
  jobId: string
  approved: boolean
  overrides: OverrideView[]
  canAuthorize: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [scope, setScope] = React.useState<WorkScope>("start_work")
  const [reason, setReason] = React.useState("")
  const [contact, setContact] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const now = Date.now()
  const active = overrides.filter((o) => !o.revoked_at && new Date(o.expires_at).getTime() > now)

  async function authorize() {
    setBusy(true)
    setError(null)
    const res = await createWorkOverride({ jobId, scope, reason, customerContact: contact })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setOpen(false)
    setReason("")
    setContact("")
    router.refresh()
  }

  async function revoke(id: string) {
    const res = await revokeWorkOverride(id)
    if (!res.ok) return setError(res.error)
    router.refresh()
  }

  if (approved && active.length === 0) return null

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden />
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">Work authorization</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {approved
              ? "The customer has approved this job."
              : "Waiting for customer approval. Work cannot start and parts cannot be ordered until the customer approves, unless a manager records an emergency authorization."}
          </p>
        </div>
      </div>

      {active.length > 0 && (
        <ul className="flex flex-col gap-2">
          {active.map((o) => (
            <li key={o.id} className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">Emergency: {WORK_SCOPE_LABELS[o.scope]}</span>
                <span className="text-xs text-muted-foreground">
                  {o.authorized_by_name ?? "Manager"}: {o.reason}. Expires {new Date(o.expires_at).toLocaleString()}.
                </span>
              </div>
              {canAuthorize && (
                <Button size="sm" variant="outline" onClick={() => revoke(o.id)}>
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!approved && canAuthorize && !open && (
        <Button size="sm" variant="outline" className="self-start" onClick={() => setOpen(true)}>
          Record emergency authorization
        </Button>
      )}

      {open && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="override-scope">Authorize</Label>
              <Select id="override-scope" value={scope} onChange={(e) => setScope(e.target.value as WorkScope)}>
                {(Object.keys(WORK_SCOPE_LABELS) as WorkScope[]).map((s) => (
                  <option key={s} value={s}>
                    {WORK_SCOPE_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="override-contact">How the customer agreed (call, WhatsApp, in person)</Label>
              <Input id="override-contact" value={contact} onChange={(e) => setContact(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="override-reason">Reason (at least 10 characters)</Label>
            <Input id="override-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Expires after {OVERRIDE_HOURS} hours. It is logged permanently and can be revoked but not deleted.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={authorize} disabled={busy}>
              Authorize
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </Card>
  )
}
