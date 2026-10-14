"use client"

import { useState } from "react"
import useSWR from "swr"
import { Button, Input, Select } from "@/components/ui"
import { listTemplates, sendTemplate } from "@/lib/actions-whatsapp"

export function TemplatePicker({
  id,
  disabled,
  onSent,
  onError,
  compact,
}: {
  id: string
  disabled?: boolean
  onSent: () => void
  onError: (msg: string) => void
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const { data: templates } = useSWR(open ? "wa-templates" : null, () => listTemplates())
  const [key, setKey] = useState("")
  const [params, setParams] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const t = templates?.find((x) => `${x.name}|${x.language}` === key)

  if (!open) {
    return (
      <Button size="sm" variant={compact ? "ghost" : "outline"} disabled={disabled} onClick={() => setOpen(true)}>
        {compact ? "Use a template" : "Send template"}
      </Button>
    )
  }

  let preview = t?.body ?? ""
  params.forEach((p, i) => (preview = preview.replace(`{{${i + 1}}}`, p || `{{${i + 1}}}`)))

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-border p-3">
      <Select
        aria-label="Template"
        value={key}
        onChange={(e) => {
          setKey(e.target.value)
          const next = templates?.find((x) => `${x.name}|${x.language}` === e.target.value)
          setParams(Array(next?.paramCount ?? 0).fill(""))
        }}
      >
        <option value="">{templates ? (templates.length ? "Choose an approved template" : "No approved templates found") : "Loading…"}</option>
        {templates?.map((x) => (
          <option key={`${x.name}|${x.language}`} value={`${x.name}|${x.language}`}>
            {x.name} ({x.language})
          </option>
        ))}
      </Select>
      {t && (
        <>
          {params.map((p, i) => (
            <Input
              key={i}
              aria-label={`Variable ${i + 1}`}
              placeholder={`Variable {{${i + 1}}}`}
              value={p}
              onChange={(e) => setParams((ps) => ps.map((v, j) => (j === i ? e.target.value : v)))}
            />
          ))}
          <p className="whitespace-pre-wrap rounded-md bg-secondary p-2 text-xs leading-relaxed text-secondary-foreground">{preview}</p>
        </>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button
          size="sm"
          disabled={!t || busy || params.some((p) => !p.trim())}
          onClick={async () => {
            if (!t) return
            setBusy(true)
            try {
              await sendTemplate(id, t.name, t.language, params)
              setOpen(false)
              setKey("")
              onSent()
            } catch (e) {
              onError((e as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        >
          Send
        </Button>
      </div>
    </div>
  )
}
