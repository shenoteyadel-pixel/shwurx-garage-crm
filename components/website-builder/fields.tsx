"use client"

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { Button, Input, Label, Textarea } from "@/components/ui"
import type { Faq, L10n, MediaAsset, SeoFields, TextItem } from "@/lib/website/types"

export function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export const emptyL10n = (): L10n => ({ en: "", ar: "" })

/** English + Arabic side by side; Arabic is typed right-to-left. */
export function L10nField({
  label,
  value,
  onChange,
  multiline = false,
  hint,
}: {
  label: string
  value: L10n
  onChange: (v: L10n) => void
  multiline?: boolean
  hint?: string
}) {
  const Control = multiline ? Textarea : Input
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="grid gap-2 md:grid-cols-2">
        <Control
          aria-label={`${label} (English)`}
          placeholder="English"
          value={value.en}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, en: e.target.value })}
        />
        <Control
          aria-label={`${label} (Arabic)`}
          placeholder="العربية"
          dir="rtl"
          lang="ar"
          value={value.ar}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, ar: e.target.value })}
        />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  hint,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  hint?: string
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="h-4 w-4 accent-[var(--primary)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}

export function MediaPicker({
  label,
  media,
  value,
  onChange,
}: {
  label: string
  media: MediaAsset[]
  value: string | null
  onChange: (id: string | null) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <select
        className="h-10 rounded-lg border border-input bg-background/60 px-3 text-sm"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">None</option>
        {media.map((m) => (
          <option key={m.id} value={m.id}>
            {(m.alt.en || m.id) + (m.approval !== "approved" || !m.publicSafe ? " (hidden until approved)" : "")}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Ordered multi-select for galleries; unapproved photos are flagged and never rendered publicly. */
export function MediaMultiPicker({
  label,
  media,
  value,
  onChange,
}: {
  label: string
  media: MediaAsset[]
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const byId = new Map(media.map((m) => [m.id, m]))
  const available = media.filter((m) => !value.includes(m.id))
  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length) return
    const next = [...value]
    const [x] = next.splice(from, 1)
    next.splice(to, 0, x)
    onChange(next)
  }
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground">No photos selected.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {value.map((id, i) => {
            const m = byId.get(id)
            const hidden = !m || m.approval !== "approved" || !m.publicSafe
            return (
              <li key={id} className="flex items-center gap-2 rounded-lg border border-border bg-background/60 p-2">
                {m ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url || "/placeholder.svg"} alt="" className="h-12 w-16 shrink-0 rounded object-cover" />
                ) : (
                  <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">deleted</span>
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-xs">{m?.alt.en || id}</span>
                  {hidden && <span className="text-[10px] text-destructive">Not shown until approved</span>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" className="rounded border border-border px-1.5 text-xs" onClick={() => move(i, i - 1)} aria-label="Move earlier">
                    {"<"}
                  </button>
                  <button type="button" className="rounded border border-border px-1.5 text-xs" onClick={() => move(i, i + 1)} aria-label="Move later">
                    {">"}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-border px-1.5 text-xs"
                    onClick={() => onChange(value.filter((x) => x !== id))}
                    aria-label={`Remove ${m?.alt.en || id}`}
                  >
                    {"×"}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {available.length > 0 && (
        <select
          aria-label={`Add photo to ${label}`}
          className="h-10 rounded-lg border border-input bg-background/60 px-3 text-sm"
          value=""
          onChange={(e) => e.target.value && onChange([...value, e.target.value])}
        >
          <option value="">Add a photo…</option>
          {available.map((m) => (
            <option key={m.id} value={m.id}>
              {(m.alt.en || m.id) + (m.approval !== "approved" || !m.publicSafe ? " (hidden until approved)" : "")}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

/** Generic ordered list with add / remove / move. */
export function ListEditor<T extends { id: string }>({
  title,
  items,
  onChange,
  create,
  render,
  addLabel = "Add",
}: {
  title: string
  items: T[]
  onChange: (items: T[]) => void
  create: () => T
  render: (item: T, update: (next: T) => void) => React.ReactNode
  addLabel?: string
}) {
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= items.length) return
    const next = items.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...items, create()])}>
          <Plus className="h-3.5 w-3.5" /> {addLabel}
        </Button>
      </div>
      {items.length === 0 && <p className="text-xs text-muted-foreground">Nothing added yet.</p>}
      {items.map((item, i) => (
        <div key={item.id} data-record={item.id} className="flex scroll-mt-24 flex-col gap-3 rounded-lg border border-border bg-background/40 p-3">
          {render(item, (next) => onChange(items.map((x) => (x.id === item.id ? next : x))))}
          <div className="flex justify-end gap-1">
            <Button type="button" size="icon" variant="ghost" aria-label="Move up" onClick={() => move(i, -1)}>
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="ghost" aria-label="Move down" onClick={() => move(i, 1)}>
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Remove"
              onClick={() => onChange(items.filter((x) => x.id !== item.id))}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

export function FaqEditor({ items, onChange }: { items: Faq[]; onChange: (v: Faq[]) => void }) {
  return (
    <ListEditor
      title="FAQs"
      items={items}
      onChange={onChange}
      addLabel="Add FAQ"
      create={() => ({ id: uid("faq"), q: emptyL10n(), a: emptyL10n() })}
      render={(f, up) => (
        <>
          <L10nField label="Question" value={f.q} onChange={(q) => up({ ...f, q })} />
          <L10nField label="Answer" value={f.a} onChange={(a) => up({ ...f, a })} multiline />
        </>
      )}
    />
  )
}

export function TextItemsEditor({ title, items, onChange }: { title: string; items: TextItem[]; onChange: (v: TextItem[]) => void }) {
  return (
    <ListEditor
      title={title}
      items={items}
      onChange={onChange}
      create={() => ({ id: uid("item"), title: emptyL10n(), body: emptyL10n() })}
      render={(t, up) => (
        <>
          <L10nField label="Title" value={t.title} onChange={(title) => up({ ...t, title })} />
          <L10nField label="Text" value={t.body} onChange={(body) => up({ ...t, body })} multiline />
        </>
      )}
    />
  )
}

export function SeoEditor({ value, onChange, media }: { value: SeoFields; onChange: (v: SeoFields) => void; media: MediaAsset[] }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-3">
      <h4 className="text-sm font-semibold">Search engine (SEO)</h4>
      <L10nField
        label="Page title"
        value={value.title}
        onChange={(title) => onChange({ ...value, title })}
        hint="Shown in Google results. Aim for under 60 characters."
      />
      <L10nField
        label="Description"
        value={value.description}
        onChange={(description) => onChange({ ...value, description })}
        multiline
        hint="Aim for 120–160 characters."
      />
      <MediaPicker label="Share image" media={media} value={value.ogImageId} onChange={(ogImageId) => onChange({ ...value, ogImageId })} />
      <Toggle label="Hide this page from search engines" checked={value.noindex} onChange={(noindex) => onChange({ ...value, noindex })} />
    </div>
  )
}
