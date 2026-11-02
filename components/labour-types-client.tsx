"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button, Card, Input, Label, Select, Badge, Textarea } from "@/components/ui"
import { formatCurrency } from "@/lib/utils"
import {
  createLabourType,
  setLabourTypeActive,
  updateLabourType,
  type LabourInput,
} from "@/lib/actions-labour"
import type { LabourType } from "@/lib/labour-types"
import { Plus, Pencil, Search, Clock, X } from "lucide-react"

const EMPTY: LabourInput = {
  name: "",
  category: "",
  rate_type: "hourly",
  rate: 0,
  default_hours: 1,
  description: "",
  sort_order: 0,
}

function toInput(t: LabourType): LabourInput {
  return {
    name: t.name,
    category: t.category ?? "",
    rate_type: t.rate_type,
    rate: t.rate,
    default_hours: t.default_hours,
    description: t.description ?? "",
    sort_order: t.sort_order,
  }
}

function priceLabel(t: Pick<LabourType, "rate_type" | "rate" | "default_hours">) {
  if (t.rate_type === "fixed") return `${formatCurrency(t.rate)} fixed`
  return `${formatCurrency(t.rate)}/hr`
}

function estimate(t: Pick<LabourType, "rate_type" | "rate" | "default_hours">) {
  return t.rate_type === "fixed" ? t.rate : t.rate * t.default_hours
}

export function LabourTypesClient({ types, canEdit }: { types: LabourType[]; canEdit: boolean }) {
  const [query, setQuery] = React.useState("")
  const [showInactive, setShowInactive] = React.useState(false)
  const [editing, setEditing] = React.useState<LabourType | "new" | null>(null)

  const q = query.trim().toLowerCase()
  const visible = types.filter(
    (t) =>
      (showInactive || t.active) &&
      (!q || t.name.toLowerCase().includes(q) || (t.category ?? "").toLowerCase().includes(q)),
  )
  const inactiveCount = types.filter((t) => !t.active).length
  const categories = [...new Set(types.map((t) => t.category).filter(Boolean))] as string[]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search labour or category"
            className="pl-9"
            aria-label="Search labour types"
          />
        </div>
        {inactiveCount > 0 && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Show disabled ({inactiveCount})
          </label>
        )}
        {canEdit && (
          <Button type="button" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Add labour
          </Button>
        )}
      </div>

      {editing && (
        <LabourForm
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      )}

      {!canEdit && (
        <p className="text-xs text-muted-foreground">
          {"You can view labour rates. Only managers with settings access can add or change them."}
        </p>
      )}

      <Card className="overflow-hidden p-0">
        <div className="hidden grid-cols-12 gap-3 border-b border-border px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
          <span className="col-span-4">Labour</span>
          <span className="col-span-2">Category</span>
          <span className="col-span-2 text-right">Rate</span>
          <span className="col-span-1 text-right">Hours</span>
          <span className="col-span-2 text-right">Typical charge</span>
          <span className="col-span-1" />
        </div>
        {visible.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {types.length === 0 ? "No labour types yet. Add your first one." : "No labour matches your search."}
          </p>
        )}
        <ul className="divide-y divide-border">
          {visible.map((t) => (
            <LabourRowItem key={t.id} t={t} canEdit={canEdit} onEdit={() => setEditing(t)} />
          ))}
        </ul>
      </Card>
    </div>
  )
}

function LabourRowItem({ t, canEdit, onEdit }: { t: LabourType; canEdit: boolean; onEdit: () => void }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)

  async function toggle() {
    setBusy(true)
    const res = await setLabourTypeActive(t.id, !t.active)
    setBusy(false)
    if (!res.ok) alert(res.error)
    else router.refresh()
  }

  return (
    <li className={`grid grid-cols-2 items-center gap-3 px-4 py-3 md:grid-cols-12 ${t.active ? "" : "opacity-60"}`}>
      <div className="col-span-2 flex min-w-0 flex-col md:col-span-4">
        <span className="flex items-center gap-2 font-medium">
          <span className="truncate">{t.name}</span>
          {!t.active && <Badge>Disabled</Badge>}
        </span>
        {t.description && <span className="truncate text-xs text-muted-foreground">{t.description}</span>}
      </div>
      <span className="text-sm text-muted-foreground md:col-span-2">{t.category || "—"}</span>
      <span className="text-right text-sm tabular-nums md:col-span-2">{priceLabel(t)}</span>
      <span className="flex items-center gap-1 text-sm tabular-nums text-muted-foreground md:col-span-1 md:justify-end">
        <Clock className="h-3.5 w-3.5 md:hidden" aria-hidden />
        {t.rate_type === "fixed" ? "—" : `${t.default_hours} h`}
      </span>
      <span className="text-right text-sm font-semibold tabular-nums md:col-span-2">{formatCurrency(estimate(t))}</span>
      <div className="col-span-2 flex justify-end gap-1 md:col-span-1">
        {canEdit && (
          <>
            <button
              type="button"
              onClick={onEdit}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={`Edit ${t.name}`}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={toggle}
              disabled={busy}
              className="rounded-lg px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {t.active ? "Disable" : "Enable"}
            </button>
          </>
        )}
      </div>
    </li>
  )
}

function LabourForm({
  initial,
  categories,
  onClose,
}: {
  initial: LabourType | null
  categories: string[]
  onClose: () => void
}) {
  const router = useRouter()
  const [form, setForm] = React.useState<LabourInput>(initial ? toInput(initial) : EMPTY)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const listId = React.useId()

  const set = (patch: Partial<LabourInput>) => setForm((f) => ({ ...f, ...patch }))
  const fixed = form.rate_type === "fixed"

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = initial ? await updateLabourType(initial.id, form) : await createLabourType(form)
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onClose()
    router.refresh()
  }

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{initial ? `Edit ${initial.name}` : "Add labour type"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="labour-name">Name</Label>
            <Input
              id="labour-name"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="e.g. AC Labour, Denting, Wheel Alignment"
              required
              maxLength={80}
            />
          </div>
          <div>
            <Label htmlFor="labour-category">Category</Label>
            <Input
              id="labour-category"
              value={form.category}
              onChange={(e) => set({ category: e.target.value })}
              placeholder="e.g. Engine, Electrical, AC, Body"
              list={listId}
              maxLength={60}
            />
            <datalist id={listId}>
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <Label htmlFor="labour-type">Charged</Label>
            <Select
              id="labour-type"
              value={form.rate_type}
              onChange={(e) => set({ rate_type: e.target.value === "fixed" ? "fixed" : "hourly" })}
            >
              <option value="hourly">Per hour</option>
              <option value="fixed">Fixed price (flat job)</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="labour-rate">{fixed ? "Price (AED)" : "Rate / hour (AED)"}</Label>
              <Input
                id="labour-rate"
                type="number"
                min={0}
                step="0.01"
                value={form.rate}
                onChange={(e) => set({ rate: Number(e.target.value) })}
                required
              />
            </div>
            <div>
              <Label htmlFor="labour-hours">Default hours</Label>
              <Input
                id="labour-hours"
                type="number"
                min={0}
                step="0.25"
                value={fixed ? 1 : form.default_hours}
                onChange={(e) => set({ default_hours: Number(e.target.value) })}
                disabled={fixed}
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="labour-desc">Notes for advisors (optional)</Label>
            <Textarea
              id="labour-desc"
              rows={2}
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="What this labour covers, when to use it"
              maxLength={1000}
            />
          </div>
          <div>
            <Label htmlFor="labour-sort">Order in quote picker</Label>
            <Input
              id="labour-sort"
              type="number"
              step="1"
              value={form.sort_order}
              onChange={(e) => set({ sort_order: Number(e.target.value) })}
            />
          </div>
          <div className="flex flex-col justify-end">
            <p className="text-sm text-muted-foreground">
              Typical charge{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {formatCurrency(estimate({ rate_type: form.rate_type, rate: form.rate || 0, default_hours: form.default_hours || 0 }))}
              </span>
            </p>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : initial ? "Save changes" : "Add labour"}
          </Button>
        </div>
      </form>
    </Card>
  )
}
