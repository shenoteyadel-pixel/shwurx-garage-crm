"use client"

import * as React from "react"
import { ShieldAlert, CircleX, CircleAlert } from "lucide-react"
import type { StageMoveResult } from "@/lib/actions"

export type StageBlock = Extract<StageMoveResult, { ok: false }> & { targetLabel: string }

const MIN_REASON = 10

/**
 * Explains why a stage move was refused. When every failed check is soft and
 * the user is an owner or general manager, it offers a written override.
 */
export function StageBlockDialog({
  block,
  onClose,
  onOverride,
}: {
  block: StageBlock
  onClose: () => void
  onOverride: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const reasonOk = reason.trim().length >= MIN_REASON
  const missing = block.missing ?? []

  async function confirm() {
    if (!reasonOk) return
    setSaving(true)
    try {
      await onOverride(reason.trim())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stage-block-title"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-400" aria-hidden="true" />
          <h2 id="stage-block-title" className="text-sm font-semibold">
            {`Can't move to ${block.targetLabel} yet`}
          </h2>
        </div>

        {missing.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {missing.map((m) => (
              <li key={m.check} className="flex items-start gap-2 text-sm leading-relaxed">
                {m.overridable ? (
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                ) : (
                  <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                )}
                <span>
                  {m.label}
                  {!m.overridable && <span className="text-muted-foreground"> (required, can&apos;t be overridden)</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{block.error}</p>
        )}

        {block.canOverride && (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-background p-3">
            <label htmlFor="override-reason" className="text-xs font-medium text-muted-foreground">
              Manager override: why is this move needed? (saved to the job history)
            </label>
            <textarea
              id="override-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="e.g. Customer approved by phone, diagnosis to be typed up after the road test"
            />
            <p className="text-xs text-muted-foreground">
              {reasonOk ? "Ready to override." : `At least ${MIN_REASON} characters.`}
            </p>
            {missing.length === 0 && block.error && (
              <p role="alert" className="text-xs text-destructive">
                {block.error}
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-md border border-border bg-background py-2 text-sm font-medium transition hover:bg-muted/40"
          >
            {block.canOverride ? "Cancel" : "OK"}
          </button>
          {block.canOverride && (
            <button
              type="button"
              onClick={confirm}
              disabled={!reasonOk || saving}
              className="flex-1 rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Moving…" : "Override and move"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
