"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button, Card, Input, Label, Select, Badge, Textarea } from "@/components/ui"
import { formatCurrency } from "@/lib/utils"
import {
  bulkUpdateLabourRates,
  createLabourType,
  setLabourTypeActive,
  updateLabourType,
  type BulkLabourInput,
  type LabourInput,
} from "@/lib/actions-labour"
import type { LabourType } from "@/lib/labour-types"
import { Plus, Pencil, Search, Clock, X, Layers } from "lucide-react"

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

function BulkRatePanel({ types, categories }: { types: LabourType[]; categories: string[] }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [mode, setMode] = React.useState<BulkLabourInput["mode"]>("percent")
  const [value, setValue] = React.useState("")
  const [applyTo, setApplyTo] = React.useState<BulkLabourInput["applyTo"]>("hourly")
  const [category, setCategory] = React.useState("")
  const [pending, startTransition] = React.useTransition()
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null)

  const num = Number(value)
  const valid = value.trim() !== "" && Number.isFinite(num)
  const affected = types.filter(
    (t) => t.active && (applyTo === "all" || t.rate_type === applyTo) && (!category || t.category === category),
  )
  const preview = affected.slice(0, 4).map((t) => {
    const next = mode === "set" ? num : mode === "percent" ? t.rate * (1 + num / 100) : t.rate + num
    return { t, next: Math.min(100000, Math.max(0, Math.round(next * 100) / 100)) }
  })

  function submit() {
    if (!valid || affected.length === 0) return
    const label = mode === "set" ? `set to ${formatCurrency(num)}` : mode === "percent" ? `changed by ${num}%` : `changed by ${formatCurrency(num)}`
    if (!window.confirm(`Update ${affected.length} labour rate(s), ${label}? Quotes already sent are not changed.`)) return
    setMessage(null)
    startTransition(async () => {
      const res = await bulkUpdateLabourRates({ mode, value: num, applyTo, category })
      if (res.ok) {
        setMessage({ ok: true, text: `${res.updated} labour rate(s) updated.` })
        setValue("")
        router.refresh()
      } else {
        setMessage({ ok: false, text: res.error })
      }
    })
  }

  if (!open) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium">Change all rates at once</p>
          <p className="text-xs text-muted-foreground">Owner only. Update every labour rate for all cars in one step.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          <Layers className="h-4 w-4" /> Bulk update
        </Button>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium">Change all rates at once</p>
          <p className="text-xs text-muted-foreground">
            Applies to active labour types for all cars. New quotes use the new rates; sent quotes stay the same.
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close bulk update">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bulk-mode">How</Label>
          <Select id="bulk-mode" value={mode} onChange={(e) => setMode(e.target.value as BulkLabourInput["mode"])}>
            <option value="percent">Increase / decrease by %</option>
            <option value="amount">Add / subtract AED</option>
            <option value="set">Set exact rate (AED)</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bulk-value">{mode === "percent" ? "Percent (e.g. 10 or -5)" : mode === "amount" ? "AED (e.g. 20 or -10)" : "New rate (AED)"}</Label>
          <Input id="bulk-value" type="number" inputMode="decimal" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bulk-apply">Apply to</Label>
          <Select id="bulk-apply" value={applyTo} onChange={(e) => setApplyTo(e.target.value as BulkLabourInput["applyTo"])}>
            <option value="hourly">Hourly rates</option>
            <option value="fixed">Fixed prices</option>
            <option value="all">All labour types</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bulk-category">Category</Label>
          <Select id="bulk-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 rounded-md border border-border p-3 text-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {affected.length} labour type(s) will change
        </p>
        {valid &&
          preview.map(({ t, next }) => (
            <p key={t.id} className="flex justify-between gap-3">
              <span className="truncate">{t.name}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatCurrency(t.rate)} {"→"} <span className="text-foreground">{formatCurrency(next)}</span>
              </span>
            </p>
          ))}
        {valid && affected.length > preview.length && (
          <p className="text-xs text-muted-foreground">and {affected.length - preview.length} more</p>
        )}
      </div>

      {message && (
        <p role="status" className={message.ok ? "text-sm text-primary" : "text-sm text-destructive"}>
          {message.text}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="button" onClick={submit} disabled={!valid || affected.length === 0 || pending}>
          {pending ? "Updating..." : `Apply to ${affected.length}`}
        </Button>
      </div>
    </Card>
  )
}

export function LabourTypesClient({
  types,
  canEdit,
  isOwner = false,
}: {
  types: LabourType[]
  canEdit: boolean
  isOwner?: boolean
}) {
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

      {isOwner && <BulkRatePanel types={types} categories={categories} />}

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
