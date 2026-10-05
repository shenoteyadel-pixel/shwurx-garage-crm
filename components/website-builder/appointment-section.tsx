"use client"

import { Button } from "@/components/ui"
import type { WebsiteDocument } from "@/lib/website/types"
import { APPOINTMENT_TYPES } from "@/lib/website/appointment"
import { L10nField, SeoEditor, Toggle, emptyL10n } from "./fields"

type Props = { doc: WebsiteDocument; mutate: (fn: (d: WebsiteDocument) => void) => void }
const label = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[._]/g, " ")
function leaves(value: object, prefix: string[] = []): string[][] {
  return Object.entries(value).flatMap(([k, v]) => typeof v === "string" ? [[...prefix, k]] : leaves(v, [...prefix, k]))
}
function read(value: object, path: string[]): string {
  return path.reduce<unknown>((v, k) => (v as Record<string, unknown>)[k], value) as string
}
function write(value: object, path: string[], text: string) {
  let node = value as Record<string, unknown>
  for (const k of path.slice(0, -1)) node = node[k] as Record<string, unknown>
  node[path[path.length - 1]] = text
}

export function AppointmentPageSection({ doc, mutate }: Props) {
  const p = doc.pages.appointment
  return <section data-record="appointment" className="flex scroll-mt-24 flex-col gap-4 border-t border-border pt-5">
    <h3 className="font-semibold">Appointment page</h3>
    <Toggle label="Show the appointment page" checked={p.visible} onChange={(v) => mutate((d) => { d.pages.appointment.visible = v })} />
    {(["badge", "title", "body", "preferToCall", "disabledMessage", "contactLabel"] as const).map((k) =>
      <L10nField key={k} label={label(k)} value={p[k]} multiline={k === "body" || k === "disabledMessage"} onChange={(v) => mutate((d) => { d.pages.appointment[k] = v })} />)}
    <h4 className="text-sm font-medium">Visit information points</h4>
    {p.points.map((point, i) => <div key={i} className="flex flex-col gap-2">
      <L10nField label={`Point ${i + 1}`} value={point} onChange={(v) => mutate((d) => { d.pages.appointment.points[i] = v })} />
      <div className="flex gap-2">
        <Button type="button" variant="ghost" disabled={i === 0} onClick={() => mutate((d) => {
          const points = d.pages.appointment.points
          ;[points[i - 1], points[i]] = [points[i], points[i - 1]]
        })}>Move up</Button>
        <Button type="button" variant="ghost" onClick={() => mutate((d) => { d.pages.appointment.points.splice(i, 1) })}>Remove point</Button>
      </div>
    </div>)}
    <Button type="button" variant="secondary" onClick={() => mutate((d) => { d.pages.appointment.points.push(emptyL10n()) })}>Add point</Button>
    <SeoEditor value={p.seo} media={doc.media} onChange={(v) => mutate((d) => { d.pages.appointment.seo = v })} />
  </section>
}

export function AppointmentFormSection({ doc, mutate }: Props) {
  const f = doc.forms.appointment
  return <section data-record="appointment-form" className="flex scroll-mt-24 flex-col gap-4 border-t border-border pt-5">
    <h3 className="font-semibold">Appointment form</h3>
    <p className="text-sm text-muted-foreground">Controls the public request form. The team still confirms availability and manages bookings in the CRM. Name, phone and pickup address requirements stay in place.</p>
    <Toggle label="Accept website appointment requests" checked={f.enabled} onChange={(v) => mutate((d) => { d.forms.appointment.enabled = v })} />
    <h4 className="text-sm font-medium">Available request types</h4>
    {APPOINTMENT_TYPES.map((type) => <Toggle key={type} label={f.copy.en.types[type].label} checked={f.modes[type]} onChange={(v) => mutate((d) => { d.forms.appointment.modes[type] = v })} />)}
    <h4 className="text-sm font-medium">Optional fields shown to visitors</h4>
    {(Object.keys(f.optionalFields) as (keyof typeof f.optionalFields)[]).map((k) =>
      <Toggle key={k} label={label(k)} checked={f.optionalFields[k]} onChange={(v) => mutate((d) => { d.forms.appointment.optionalFields[k] = v })} />)}
    <h4 className="text-sm font-medium">Services offered in this form</h4>
    {doc.services.map((s) => <Toggle key={s.slug} label={s.name.en + (s.visible ? "" : " (hidden on website)")} checked={f.serviceSlugs.includes(s.slug)} onChange={(v) => mutate((d) => {
      d.forms.appointment.serviceSlugs = v ? [...new Set([...d.forms.appointment.serviceSlugs, s.slug])] : d.forms.appointment.serviceSlugs.filter((x) => x !== s.slug)
    })} />)}
    <Toggle label="Offer Other / not sure" checked={f.allowOther} onChange={(v) => mutate((d) => { d.forms.appointment.allowOther = v })} />
    <details>
      <summary className="cursor-pointer text-sm font-medium">Labels, placeholders, guidance and confirmation messages</summary>
      <div className="mt-4 grid gap-4">
        {leaves(f.copy.en).map((path) => <L10nField key={path.join(".")} label={path.map(label).join(" — ")}
          value={{ en: read(f.copy.en, path), ar: read(f.copy.ar, path) }}
          onChange={(v) => mutate((d) => { write(d.forms.appointment.copy.en, path, v.en); write(d.forms.appointment.copy.ar, path, v.ar) })} />)}
      </div>
    </details>
  </section>
}
