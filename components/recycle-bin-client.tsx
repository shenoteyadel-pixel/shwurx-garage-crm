"use client"

import { useState, useTransition } from "react"
import { Card, Button, Badge } from "@/components/ui"
import { Modal } from "@/components/modal"
import { restoreRecord, purgeRecord } from "@/lib/actions-recycle-bin"
import type { ArchivedGroup, RecycleEntityKey } from "@/lib/recycle-bin"
import { Trash2, RotateCcw, ImageIcon, AlertTriangle } from "lucide-react"

function formatWhen(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

interface PurgeTarget {
  entity: RecycleEntityKey
  id: string
  label: string
}

export function RecycleBinClient({ groups }: { groups: ArchivedGroup[] }) {
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [purgeTarget, setPurgeTarget] = useState<PurgeTarget | null>(null)
  const [error, setError] = useState<string | null>(null)

  const totalItems = groups.reduce((n, g) => n + g.rows.length, 0)

  function handleRestore(entity: RecycleEntityKey, id: string) {
    setError(null)
    setBusyId(id)
    startTransition(async () => {
      try {
        await restoreRecord(entity, id)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setBusyId(null)
      }
    })
  }

  function handlePurge() {
    if (!purgeTarget) return
    const { entity, id } = purgeTarget
    setError(null)
    setBusyId(id)
    startTransition(async () => {
      try {
        await purgeRecord(entity, id)
        setPurgeTarget(null)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setBusyId(null)
      }
    })
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary">
            <Trash2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Recycle Bin</h1>
            <p className="text-sm text-muted-foreground">
              Deleted records are archived here and kept until you restore or permanently remove them.
            </p>
          </div>
        </div>
      </header>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {totalItems === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
            <Trash2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <div className="font-medium">The Recycle Bin is empty</div>
            <p className="text-sm text-muted-foreground">Nothing has been deleted. Archived records will appear here.</p>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.key}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h2>
                <Badge>{group.rows.length}</Badge>
              </div>
              <Card className="divide-y divide-border p-0">
                {group.rows.map((row) => {
                  const rowBusy = pending && busyId === row.id
                  return (
                    <div key={row.id} className="flex items-center gap-3 px-4 py-3">
                      {row.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.image || "/placeholder.svg"}
                          alt={row.label}
                          className="h-10 w-10 shrink-0 rounded-md object-cover"
                          crossOrigin="anonymous"
                        />
                      ) : (
                        group.key === "vehicle_photos" && (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary">
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{row.label}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {row.detail ? `${row.detail} · ` : ""}
                          Deleted {formatWhen(row.deletedAt)} by {row.deletedByName}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={rowBusy}
                          onClick={() => handleRestore(group.key, row.id)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restore
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={rowBusy}
                          onClick={() => setPurgeTarget({ entity: group.key, id: row.id, label: row.label })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </Card>
            </section>
          ))}
        </div>
      )}

      <Modal open={!!purgeTarget} onClose={() => setPurgeTarget(null)} title="Permanently delete record" size="sm">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">
              This cannot be undone. <span className="font-semibold">{purgeTarget?.label}</span> will be permanently
              removed from the database.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPurgeTarget(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handlePurge} disabled={pending}>
              {pending ? "Deleting…" : "Permanently delete"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
