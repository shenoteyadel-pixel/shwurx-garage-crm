"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button, Field, Input, AutoTextarea } from "@/components/ui"
import type { ChecklistItem } from "@/lib/technician-tasks"
import { saveTaskNotes } from "@/lib/actions-technician"

const RESULTS = [
  { value: "ok", label: "OK", on: "bg-emerald-600 text-white" },
  { value: "attention", label: "Attention", on: "bg-amber-500 text-black" },
  { value: "fail", label: "Fail", on: "bg-red-600 text-white" },
] as const

export function TaskNotes({
  taskId,
  locked,
  initial,
}: {
  taskId: string
  locked: boolean
  initial: { checklist: ChecklistItem[]; findings: string; fault_codes: string; comments: string; recommendations: string }
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [form, setForm] = useState(initial)
  const [newItem, setNewItem] = useState("")
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const setItem = (i: number, patch: Partial<ChecklistItem>) =>
    setForm((f) => ({ ...f, checklist: f.checklist.map((c, j) => (j === i ? { ...c, ...patch } : c)) }))

  function save() {
    setMessage(null)
    start(async () => {
      const res = await saveTaskNotes(taskId, form)
      setMessage(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error })
      if (res.ok) router.refresh()
    })
  }

  return (
    <section aria-labelledby="inspection-heading" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <h2 id="inspection-heading" className="text-base font-semibold">
        Inspection checklist & notes
      </h2>

      <ul className="flex flex-col divide-y divide-border">
        {form.checklist.map((item, i) => (
          <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="text-sm">{item.label}</span>
            <div role="group" aria-label={item.label} className="flex gap-1">
              {RESULTS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  disabled={locked}
                  aria-pressed={item.result === r.value}
                  onClick={() => setItem(i, { result: item.result === r.value ? null : r.value })}
                  className={cn(
                    "h-9 rounded-md px-3 text-xs font-medium transition disabled:opacity-60",
                    item.result === r.value ? r.on : "bg-secondary text-secondary-foreground hover:bg-accent",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>

      {!locked && (
        <div className="flex gap-2">
          <Input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="Add a check (e.g. Timing belt)"
            aria-label="New checklist item"
            maxLength={120}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!newItem.trim()) return
              setForm((f) => ({ ...f, checklist: [...f.checklist, { label: newItem.trim(), result: null }] }))
              setNewItem("")
            }}
          >
            <Plus className="h-4 w-4" aria-hidden /> Add
          </Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Findings" htmlFor="findings">
          <AutoTextarea id="findings" disabled={locked} value={form.findings} onChange={(e) => setForm({ ...form, findings: e.target.value })} />
        </Field>
        <Field label="Fault codes" htmlFor="fault_codes" hint="e.g. P0301, P0420">
          <Input id="fault_codes" disabled={locked} value={form.fault_codes} onChange={(e) => setForm({ ...form, fault_codes: e.target.value })} />
        </Field>
        <Field label="Technician comments" htmlFor="comments">
          <AutoTextarea id="comments" disabled={locked} value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} />
        </Field>
        <Field label="Recommendations" htmlFor="recommendations">
          <AutoTextarea
            id="recommendations"
            disabled={locked}
            value={form.recommendations}
            onChange={(e) => setForm({ ...form, recommendations: e.target.value })}
          />
        </Field>
      </div>

      {!locked && (
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save notes"}
          </Button>
          {message && (
            <span role="status" className={message.ok ? "text-sm text-emerald-300" : "text-sm text-red-300"}>
              {message.text}
            </span>
          )}
        </div>
      )}
    </section>
  )
}
