"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button, Field, AutoTextarea, Input } from "@/components/ui"
import { submitTechnicalReport } from "@/lib/actions-technician"

const FIELDS = [
  { name: "complaint", label: "Customer complaint" },
  { name: "diagnosis", label: "Diagnosis" },
  { name: "fault_codes", label: "Fault codes", short: true },
  { name: "measurements", label: "Measurements / test results" },
  { name: "root_cause", label: "Root cause" },
  { name: "recommended_repair", label: "Recommended repair" },
  { name: "work_performed", label: "Work performed" },
  { name: "additional_defects", label: "Additional defects found" },
] as const

export type ReportRow = Partial<Record<(typeof FIELDS)[number]["name"], string | null>> & {
  id: string
  created_at: string
  technician_name?: string
}

export function TaskReportForm({ taskId, defaults, locked }: { taskId: string; defaults: { complaint: string; fault_codes: string }; locked: boolean }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  if (locked) return null

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4"
      aria-labelledby="report-heading"
      action={(fd) => {
        setMessage(null)
        start(async () => {
          const res = await submitTechnicalReport(taskId, fd)
          if (res.ok) {
            formRef.current?.reset()
            setMessage({ ok: true, text: "Report submitted to the service advisor and workshop manager." })
            router.refresh()
          } else setMessage({ ok: false, text: res.error })
        })
      }}
    >
      <div className="flex flex-col gap-1">
        <h2 id="report-heading" className="text-base font-semibold">
          Technical report
        </h2>
        <p className="text-sm text-muted-foreground">Saved permanently to this vehicle&apos;s history.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {FIELDS.map((f) => (
          <Field key={f.name} label={f.label} htmlFor={`r-${f.name}`}>
            {"short" in f ? (
              <Input id={`r-${f.name}`} name={f.name} defaultValue={f.name === "fault_codes" ? defaults.fault_codes : ""} maxLength={1000} />
            ) : (
              <AutoTextarea id={`r-${f.name}`} name={f.name} defaultValue={f.name === "complaint" ? defaults.complaint : ""} maxLength={4000} />
            )}
          </Field>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Submitting…" : "Submit report"}
        </Button>
        {message && (
          <span role="status" className={message.ok ? "text-sm text-emerald-300" : "text-sm text-red-300"}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  )
}

export function ReportList({ reports, title }: { reports: ReportRow[]; title: string }) {
  if (!reports.length) return null
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {reports.map((r) => (
        <article key={r.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            {new Date(r.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
            {r.technician_name ? ` · ${r.technician_name}` : ""}
          </p>
          <dl className="grid gap-x-6 gap-y-2 md:grid-cols-2">
            {FIELDS.filter((f) => r[f.name]).map((f) => (
              <div key={f.name} className="flex flex-col">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{f.label}</dt>
                <dd className="whitespace-pre-wrap text-sm leading-relaxed">{r[f.name]}</dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </section>
  )
}
