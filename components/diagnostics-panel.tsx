"use client"

import * as React from "react"
import { Button, Card, Badge, Label, Input, AutoTextarea } from "@/components/ui"
import {
  runAiDiagnostic,
  saveDiagnosticInputs,
  addDiagnosticTest,
  updateDiagnosticTest,
  deleteDiagnosticTest,
  confirmDiagnosis,
  type AiDiagnosis,
} from "@/lib/actions-diagnostics"
import {
  Sparkles,
  ShieldAlert,
  Save,
  Loader2,
  Plus,
  Trash2,
  CircleCheck,
  FlaskConical,
  BadgeCheck,
} from "lucide-react"

export type DiagnosticTest = {
  id: string
  description: string
  source: "ai" | "manual"
  status: "not_tested" | "testing" | "pass" | "fail" | "confirmed"
  result_note: string | null
  performed_at: string | null
}

export type DiagnosticSession = {
  id: string
  symptoms: string | null
  observations: string | null
  error_codes: string | null
  ai_output: AiDiagnosis | null
  ai_model: string | null
  ai_generated_at: string | null
  confirmed_diagnosis: string | null
  confirmed_at: string | null
} | null

const TEST_STATUS: Record<DiagnosticTest["status"], { label: string; chip: string }> = {
  not_tested: { label: "Not tested", chip: "bg-muted text-muted-foreground border-border" },
  testing: { label: "Testing", chip: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
  pass: { label: "Pass", chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
  fail: { label: "Fail", chip: "bg-red-500/15 text-red-300 border-red-500/40" },
  confirmed: { label: "Confirmed", chip: "bg-primary/15 text-primary border-primary/40" },
}

const LIKELIHOOD: Record<string, string> = {
  high: "bg-red-500/15 text-red-300 border-red-500/40",
  medium: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  low: "bg-muted text-muted-foreground border-border",
}

export function DiagnosticsPanel({
  jobId,
  session,
  tests,
}: {
  jobId: string
  session: DiagnosticSession
  tests: DiagnosticTest[]
}) {
  const [savingInputs, setSavingInputs] = React.useState(false)
  const [inputsSaved, setInputsSaved] = React.useState(false)
  const [running, setRunning] = React.useState(false)
  const [runError, setRunError] = React.useState<string | null>(null)

  const ai = session?.ai_output ?? null

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">AI Diagnostic Assistant</h2>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Decision-support grounded in this workshop&apos;s real job history. Suggestions are not a substitute for
        technician judgement.
      </p>

      {/* Step 1 — structured inputs */}
      <form
        action={async (fd) => {
          setSavingInputs(true)
          setInputsSaved(false)
          try {
            await saveDiagnosticInputs(fd)
            setInputsSaved(true)
          } finally {
            setSavingInputs(false)
          }
        }}
        className="space-y-4"
      >
        <input type="hidden" name="job_id" value={jobId} />
        <div>
          <Label htmlFor="symptoms">Symptoms</Label>
          <AutoTextarea
            id="symptoms"
            name="symptoms"
            minRows={2}
            defaultValue={session?.symptoms ?? ""}
            placeholder="What the vehicle is doing: noises, warning lights, when it happens…"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="observations">Technician observations</Label>
            <AutoTextarea
              id="observations"
              name="observations"
              minRows={2}
              defaultValue={session?.observations ?? ""}
              placeholder="Measurements, visual findings, conditions reproduced…"
            />
          </div>
          <div>
            <Label htmlFor="error_codes">Error / fault codes</Label>
            <AutoTextarea
              id="error_codes"
              name="error_codes"
              minRows={2}
              defaultValue={session?.error_codes ?? ""}
              placeholder="e.g. P0300, P0171…"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" variant="secondary" disabled={savingInputs}>
            <Save className="h-4 w-4" /> {savingInputs ? "Saving…" : "Save inputs"}
          </Button>
          {inputsSaved && <span className="text-xs text-emerald-400">Saved</span>}
          <Button
            type="button"
            size="sm"
            disabled={running}
            className="ml-auto"
            onClick={async () => {
              setRunning(true)
              setRunError(null)
              try {
                await runAiDiagnostic(jobId)
              } catch (e) {
                setRunError(e instanceof Error ? e.message : "Failed to run AI diagnostic")
              } finally {
                setRunning(false)
              }
            }}
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {running ? "Analysing…" : ai ? "Re-run AI analysis" : "Run AI analysis"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Tip: save your inputs before running so the AI uses them.</p>
        {runError && <p className="text-xs text-red-400">{runError}</p>}
      </form>

      {/* Step 2 — AI results */}
      {ai && (
        <div className="mt-6 space-y-4">
          {/* Mandatory verification banner */}
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-xs leading-relaxed">
              <strong>AI Diagnostic Assistance — technician verification required.</strong> These are AI-generated
              suggestions, not a confirmed diagnosis. A qualified technician must verify each item before any repair or
              customer communication.
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Probable causes</h3>
            <div className="space-y-2">
              {ai.probableCauses.map((c, i) => (
                <div key={i} className="rounded-lg border border-border bg-background/40 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.cause}</span>
                    <Badge className={LIKELIHOOD[c.likelihood] ?? LIKELIHOOD.low}>{c.likelihood}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{c.reasoning}</p>
                </div>
              ))}
            </div>
          </div>

          {ai.similarPastJobs.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Similar past jobs
              </h3>
              <div className="space-y-1.5">
                {ai.similarPastJobs.map((j, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[11px]">
                      {j.jobNumber}
                    </span>
                    <span className="text-muted-foreground">{j.relevance}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ai.safetyNotes && ai.safetyNotes.trim() && (
            <div className="rounded-lg border border-border bg-background/40 p-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Safety notes
              </div>
              <p className="text-xs text-muted-foreground">{ai.safetyNotes}</p>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Generated by {session?.ai_model ?? "AI"}
            {session?.ai_generated_at ? ` · ${new Date(session.ai_generated_at).toLocaleString()}` : ""}
          </p>
        </div>
      )}

      {/* Step 3 — diagnostic test workflow */}
      <div className="mt-6 border-t border-border pt-4">
        <div className="mb-3 flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Diagnostic tests</h3>
        </div>

        {tests.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No tests yet. Run the AI analysis to seed recommended tests, or add your own below.
          </p>
        ) : (
          <ul className="space-y-2">
            {tests.map((t) => (
              <TestRow key={t.id} jobId={jobId} test={t} />
            ))}
          </ul>
        )}

        <form
          action={async (fd) => {
            await addDiagnosticTest(fd)
          }}
          className="mt-3 flex items-end gap-2"
        >
          <input type="hidden" name="job_id" value={jobId} />
          <div className="flex-1">
            <Label htmlFor="new_test">Add a test</Label>
            <Input id="new_test" name="description" placeholder="e.g. Compression test cylinder 3" required />
          </div>
          <Button type="submit" size="sm" variant="secondary">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </form>
      </div>

      {/* Step 4 — human confirmation */}
      <div className="mt-6 border-t border-border pt-4">
        <div className="mb-2 flex items-center gap-2">
          <BadgeCheck className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Confirmed diagnosis (technician)
          </h3>
        </div>
        {session?.confirmed_diagnosis && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
            <div>
              <p className="text-sm text-emerald-100">{session.confirmed_diagnosis}</p>
              {session.confirmed_at && (
                <p className="mt-1 text-[11px] text-emerald-300/80">
                  Confirmed {new Date(session.confirmed_at).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        )}
        <ConfirmForm jobId={jobId} current={session?.confirmed_diagnosis ?? ""} />
      </div>
    </Card>
  )
}

function TestRow({ jobId, test }: { jobId: string; test: DiagnosticTest }) {
  const meta = TEST_STATUS[test.status]
  return (
    <li className="rounded-lg border border-border bg-background/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm">{test.description}</span>
            {test.source === "ai" && (
              <Badge className="border-primary/40 bg-primary/10 text-primary">
                <Sparkles className="mr-1 h-3 w-3" /> AI
              </Badge>
            )}
          </div>
          {test.result_note && <p className="mt-1 text-xs text-muted-foreground">{test.result_note}</p>}
        </div>
        <Badge className={meta.chip}>{meta.label}</Badge>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {(["not_tested", "testing", "pass", "fail", "confirmed"] as const).map((s) => (
          <form key={s} action={updateDiagnosticTest}>
            <input type="hidden" name="job_id" value={jobId} />
            <input type="hidden" name="test_id" value={test.id} />
            <input type="hidden" name="status" value={s} />
            <button
              type="submit"
              disabled={test.status === s}
              className={`rounded border px-2 py-0.5 text-[11px] transition disabled:opacity-100 ${
                test.status === s ? TEST_STATUS[s].chip : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {TEST_STATUS[s].label}
            </button>
          </form>
        ))}
        <form action={deleteDiagnosticTest} className="ml-auto">
          <input type="hidden" name="job_id" value={jobId} />
          <input type="hidden" name="test_id" value={test.id} />
          <button type="submit" className="text-muted-foreground transition hover:text-red-400" aria-label="Delete test">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </li>
  )
}

function ConfirmForm({ jobId, current }: { jobId: string; current: string }) {
  const [saving, setSaving] = React.useState(false)
  return (
    <form
      action={async (fd) => {
        setSaving(true)
        try {
          await confirmDiagnosis(fd)
        } finally {
          setSaving(false)
        }
      }}
      className="space-y-2"
    >
      <input type="hidden" name="job_id" value={jobId} />
      <AutoTextarea
        name="confirmed_diagnosis"
        minRows={2}
        defaultValue={current}
        placeholder="Enter the verified, final diagnosis after completing tests…"
        required
      />
      <Button type="submit" size="sm" disabled={saving}>
        <BadgeCheck className="h-4 w-4" /> {saving ? "Saving…" : current ? "Update confirmed diagnosis" : "Confirm diagnosis"}
      </Button>
    </form>
  )
}
