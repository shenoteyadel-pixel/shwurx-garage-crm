"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button, Field, Input, Select, Textarea } from "@/components/ui"
import { PART_CATEGORIES, PART_URGENCIES } from "@/lib/technician-tasks"
import { requestTaskPart } from "@/lib/actions-technician"

export type TaskPart = {
  id: string
  part_name: string
  quantity: number
  status: string
  urgency: string | null
  category: string | null
  oem_number: string | null
  estimated_availability: string | null
  created_at: string
}

export function TaskParts({ taskId, parts, locked }: { taskId: string; parts: TaskPart[]; locked: boolean }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  return (
    <section aria-labelledby="parts-heading" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-1">
        <h2 id="parts-heading" className="text-base font-semibold">
          Parts
        </h2>
        <p className="text-sm text-muted-foreground">Purchasing sets the supplier and price. Requesting a part pauses your clock.</p>
      </div>

      {parts.length > 0 && (
        <ul className="flex flex-col divide-y divide-border">
          {parts.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div className="flex flex-col">
                <span className="font-medium">
                  {p.part_name} × {p.quantity}
                </span>
                <span className="text-xs text-muted-foreground">
                  {[p.oem_number, p.category?.toUpperCase(), p.urgency && `${p.urgency} urgency`].filter(Boolean).join(" · ")}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs font-medium capitalize">{p.status.replace(/_/g, " ")}</span>
                {p.estimated_availability && (
                  <span className="text-xs text-muted-foreground">
                    ETA {new Date(p.estimated_availability).toLocaleDateString("en-GB", { dateStyle: "medium" })}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!locked && (
        <form
          ref={formRef}
          className="grid gap-4 md:grid-cols-2"
          action={(fd) => {
            setMessage(null)
            start(async () => {
              const res = await requestTaskPart(taskId, fd)
              if (res.ok) {
                formRef.current?.reset()
                setMessage({ ok: true, text: "Request sent to purchasing, the advisor and the workshop manager." })
                router.refresh()
              } else setMessage({ ok: false, text: res.error })
            })
          }}
        >
          <Field label="Part name" htmlFor="p-name">
            <Input id="p-name" name="part_name" required maxLength={200} />
          </Field>
          <Field label="OEM / part number" htmlFor="p-oem">
            <Input id="p-oem" name="oem_number" maxLength={80} />
          </Field>
          <Field label="Quantity" htmlFor="p-qty">
            <Input id="p-qty" name="quantity" type="number" inputMode="numeric" min={1} max={999} defaultValue={1} required />
          </Field>
          <Field label="Type" htmlFor="p-cat">
            <Select id="p-cat" name="category" defaultValue="oem">
              {PART_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Urgency" htmlFor="p-urg">
            <Select id="p-urg" name="urgency" defaultValue="normal">
              {PART_URGENCIES.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Photo of the part (optional)" htmlFor="p-photo">
            <Input id="p-photo" name="photo" type="file" accept="image/*" capture="environment" />
          </Field>
          <Field label="Technical note" htmlFor="p-note" className="md:col-span-2">
            <Textarea id="p-note" name="technical_note" rows={2} maxLength={1000} placeholder="Why it is needed, condition of the old part…" />
          </Field>
          <div className="flex items-center gap-3 md:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Request part"}
            </Button>
            {message && (
              <span role="status" className={message.ok ? "text-sm text-emerald-300" : "text-sm text-red-300"}>
                {message.text}
              </span>
            )}
          </div>
        </form>
      )}
    </section>
  )
}
