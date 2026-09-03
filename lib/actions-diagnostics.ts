"use server"

import { z } from "zod"
import { generateObject } from "ai"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, logAction, type SessionContext } from "@/lib/rbac/context"
import type { Permission } from "@/lib/rbac/roles"

/**
 * AI Diagnostic Assistant (Modules 1, 2, 12).
 *
 * The AI is strictly advisory: it produces probable causes, recommended tests,
 * and references grounded in this workshop's real job history. A human technician
 * must verify every suggestion and confirm the final diagnosis — the model never
 * writes `confirmed_diagnosis`, and it never creates quotations or parts.
 */

const DIAGNOSTIC_MODEL = "anthropic/claude-sonnet-5"

async function guard(perm: Permission): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; ctx: SessionContext }> {
  const ctx = await requirePermission(perm)
  const supabase = await createClient()
  return { supabase, ctx }
}

/* ---------------- Structured AI schema ---------------- */

const aiDiagnosisSchema = z.object({
  probableCauses: z
    .array(
      z.object({
        cause: z.string().describe("A specific, plausible mechanical/electrical cause"),
        likelihood: z.enum(["high", "medium", "low"]),
        reasoning: z.string().describe("Why this cause fits the reported symptoms"),
      }),
    )
    .describe("Ranked probable causes, most likely first"),
  recommendedTests: z
    .array(
      z.object({
        test: z.string().describe("A concrete diagnostic test or inspection a technician can perform"),
        expectedIfCause: z.string().describe("What result would confirm/eliminate a cause"),
      }),
    )
    .describe("Actionable tests to confirm or rule out the causes"),
  similarPastJobs: z
    .array(
      z.object({
        jobNumber: z.string().describe("The job_number of a genuinely relevant past job from the provided history"),
        relevance: z.string().describe("How that past job relates to the current symptoms"),
      }),
    )
    .describe("Only reference past jobs that actually appear in the provided history. Empty array if none apply."),
  safetyNotes: z.string().describe("Any safety precautions for the technician. Empty string if none."),
})

export type AiDiagnosis = z.infer<typeof aiDiagnosisSchema>

/* ---------------- Session helpers ---------------- */

/** Get the existing diagnostic session for a job, or create an empty one. */
async function getOrCreateSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
  userId: string,
) {
  const { data: existing } = await supabase.from("diagnostic_sessions").select("*").eq("job_id", jobId).maybeSingle()
  if (existing) return existing

  const { data: created, error } = await supabase
    .from("diagnostic_sessions")
    .insert({ job_id: jobId, created_by: userId })
    .select("*")
    .single()
  if (error) throw new Error(error.message)
  return created
}

/** Persist the technician's structured inputs (symptoms/observations/error codes). */
export async function saveDiagnosticInputs(formData: FormData) {
  const { supabase, ctx } = await guard("jobs.edit")
  const jobId = String(formData.get("job_id") || "")
  if (!jobId) throw new Error("Missing job_id")

  const session = await getOrCreateSession(supabase, jobId, ctx.userId)
  const { error } = await supabase
    .from("diagnostic_sessions")
    .update({
      symptoms: String(formData.get("symptoms") || "") || null,
      observations: String(formData.get("observations") || "") || null,
      error_codes: String(formData.get("error_codes") || "") || null,
    })
    .eq("id", session.id)
  if (error) throw new Error(error.message)

  await logAction(ctx, "diagnostic_inputs_saved", "job", jobId)
  revalidatePath(`/jobs/${jobId}`)
}

/* ---------------- AI grounding + run ---------------- */

/** Build a compact, real-history context so the model doesn't hallucinate prior jobs. */
async function buildHistoryContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  job: any,
): Promise<string> {
  const lines: string[] = []

  // Prior jobs on THIS exact vehicle (by plate / vin when available, else make+model+customer).
  let sameVehicle: any[] = []
  if (job.vehicle_id) {
    const { data } = await supabase
      .from("jobs")
      .select("job_number, complaint, diagnosis, work_performed, created_at, mileage")
      .eq("vehicle_id", job.vehicle_id)
      .neq("id", job.id)
      .order("created_at", { ascending: false })
      .limit(8)
    sameVehicle = data ?? []
  }

  // Similar jobs across the workshop for the same make/model.
  const { data: similar } = await supabase
    .from("jobs")
    .select("job_number, complaint, diagnosis, work_performed, vehicle_make, vehicle_model, created_at")
    .eq("vehicle_make", job.vehicle_make)
    .eq("vehicle_model", job.vehicle_model)
    .neq("id", job.id)
    .order("created_at", { ascending: false })
    .limit(10)

  if (sameVehicle.length) {
    lines.push("### Previous jobs on THIS vehicle:")
    for (const j of sameVehicle) {
      lines.push(
        `- ${j.job_number} (${j.created_at?.slice(0, 10)}): complaint="${j.complaint ?? "-"}"; diagnosis="${j.diagnosis ?? "-"}"; work="${j.work_performed ?? "-"}"`,
      )
    }
  }
  if (similar?.length) {
    lines.push(`### Past ${job.vehicle_make} ${job.vehicle_model} jobs in this workshop:`)
    for (const j of similar) {
      lines.push(
        `- ${j.job_number} (${j.created_at?.slice(0, 10)}): complaint="${j.complaint ?? "-"}"; diagnosis="${j.diagnosis ?? "-"}"; work="${j.work_performed ?? "-"}"`,
      )
    }
  }

  return lines.length ? lines.join("\n") : "No relevant past jobs found in the workshop history."
}

/** Run the AI diagnostic. Grounds on real history and stores structured output. */
export async function runAiDiagnostic(
  jobId: string,
  inputs?: { symptoms?: string; observations?: string; error_codes?: string },
) {
  const { supabase, ctx } = await guard("jobs.edit")

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select(
      "id, job_number, vehicle_id, vehicle_make, vehicle_model, vehicle_year, variant, color, body_type, plate_number, vin, mileage, complaint, diagnosis, technician_notes",
    )
    .eq("id", jobId)
    .single()
  if (jobErr || !job) throw new Error(jobErr?.message || "Job not found")

  const session = await getOrCreateSession(supabase, jobId, ctx.userId)

  // Persist the latest form inputs FIRST so the AI analyses exactly what the
  // technician currently sees on screen — not a stale/earlier saved version.
  if (inputs) {
    const next = {
      symptoms: inputs.symptoms?.trim() || null,
      observations: inputs.observations?.trim() || null,
      error_codes: inputs.error_codes?.trim() || null,
    }
    const { error: saveErr } = await supabase.from("diagnostic_sessions").update(next).eq("id", session.id)
    if (saveErr) throw new Error(saveErr.message)
    Object.assign(session, next)
  }

  // Require something to analyse so the model never runs on an empty case.
  if (!session.symptoms && !session.observations && !session.error_codes && !job.complaint) {
    throw new Error("Add symptoms, observations, error codes, or a complaint before running the analysis.")
  }

  const history = await buildHistoryContext(supabase, job)

  const vehicle = [job.vehicle_year, job.vehicle_make, job.vehicle_model, job.variant].filter(Boolean).join(" ")
  const vehicleExtras = [
    job.color ? `colour ${job.color}` : null,
    job.body_type ? `body ${job.body_type}` : null,
    job.mileage ? `${job.mileage} km` : null,
    job.vin ? `VIN ${job.vin}` : null,
    job.plate_number ? `plate ${job.plate_number}` : null,
  ]
    .filter(Boolean)
    .join(", ")

  const prompt = [
    `You are an expert automotive master technician assisting a workshop in the UAE. Analyse the case below and return structured diagnostic guidance.`,
    ``,
    `VEHICLE: ${vehicle || "Unknown"}${vehicleExtras ? ` (${vehicleExtras})` : ""}`,
    `ORIGINAL COMPLAINT: ${job.complaint || "(none recorded)"}`,
    `TECHNICIAN SYMPTOMS: ${session.symptoms || "(none)"}`,
    `TECHNICIAN OBSERVATIONS: ${session.observations || "(none)"}`,
    `ERROR / FAULT CODES: ${session.error_codes || "(none)"}`,
    `WORKING DIAGNOSIS SO FAR: ${job.diagnosis || "(none)"}`,
    `TECHNICIAN NOTES: ${job.technician_notes || "(none)"}`,
    ``,
    `WORKSHOP HISTORY (use ONLY these when citing "similar past jobs" — never invent job numbers):`,
    history,
    ``,
    `Rules:`,
    `- Be specific and practical for a working technician.`,
    `- Ground your reasoning in the vehicle details, symptoms, observations, and error codes provided above.`,
    `- Rank probable causes by likelihood.`,
    `- Only cite past jobs that appear verbatim in the WORKSHOP HISTORY above; otherwise return an empty similarPastJobs array.`,
    `- This is decision-support only; a human technician will verify everything.`,
  ].join("\n")

  let result: AiDiagnosis
  try {
    const { object } = await generateObject({
      model: DIAGNOSTIC_MODEL,
      schema: aiDiagnosisSchema,
      prompt,
    })
    result = object
  } catch (err) {
    console.log("[v0] runAiDiagnostic error:", err instanceof Error ? err.message : String(err))
    throw new Error("The AI diagnostic could not be generated. Please try again.")
  }

  const now = new Date().toISOString()
  const { error: upErr } = await supabase
    .from("diagnostic_sessions")
    .update({ ai_output: result, ai_model: DIAGNOSTIC_MODEL, ai_generated_at: now })
    .eq("id", session.id)
  if (upErr) throw new Error(upErr.message)

  // Seed recommended tests as workflow rows (skip ones already present).
  const { data: existingTests } = await supabase
    .from("diagnostic_tests")
    .select("description")
    .eq("session_id", session.id)
  const have = new Set((existingTests ?? []).map((t) => t.description.trim().toLowerCase()))
  const toInsert = result.recommendedTests
    .filter((t) => !have.has(t.test.trim().toLowerCase()))
    .map((t, i) => ({
      session_id: session.id,
      description: t.test,
      source: "ai" as const,
      status: "not_tested" as const,
      position: i,
    }))
  if (toInsert.length) await supabase.from("diagnostic_tests").insert(toInsert)

  await logAction(ctx, "diagnostic_ai_run", "job", jobId, { model: DIAGNOSTIC_MODEL })
  revalidatePath(`/jobs/${jobId}`)
}

/* ---------------- Test workflow ---------------- */

export async function addDiagnosticTest(formData: FormData) {
  const { supabase, ctx } = await guard("jobs.edit")
  const jobId = String(formData.get("job_id") || "")
  const description = String(formData.get("description") || "").trim()
  if (!jobId || !description) throw new Error("Missing job or description")

  const session = await getOrCreateSession(supabase, jobId, ctx.userId)
  const { data: max } = await supabase
    .from("diagnostic_tests")
    .select("position")
    .eq("session_id", session.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase.from("diagnostic_tests").insert({
    session_id: session.id,
    description,
    source: "manual",
    position: (max?.position ?? -1) + 1,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/jobs/${jobId}`)
}

export async function updateDiagnosticTest(formData: FormData) {
  const { supabase, ctx } = await guard("jobs.edit")
  const jobId = String(formData.get("job_id") || "")
  const testId = String(formData.get("test_id") || "")
  const status = String(formData.get("status") || "")
  const allowed = ["not_tested", "testing", "pass", "fail", "confirmed"]
  if (!jobId || !testId || !allowed.includes(status)) throw new Error("Invalid test update")

  const resultNote = String(formData.get("result_note") || "") || null
  const stamp = status === "not_tested"
    ? { performed_by: null, performed_at: null }
    : { performed_by: ctx.userId, performed_at: new Date().toISOString() }

  const { error } = await supabase
    .from("diagnostic_tests")
    .update({ status, result_note: resultNote, ...stamp })
    .eq("id", testId)
  if (error) throw new Error(error.message)

  await logAction(ctx, "diagnostic_test_updated", "job", jobId, { testId, status })
  revalidatePath(`/jobs/${jobId}`)
}

export async function deleteDiagnosticTest(formData: FormData) {
  const { supabase } = await guard("jobs.edit")
  const jobId = String(formData.get("job_id") || "")
  const testId = String(formData.get("test_id") || "")
  if (!jobId || !testId) throw new Error("Missing test")
  const { error } = await supabase.from("diagnostic_tests").delete().eq("id", testId)
  if (error) throw new Error(error.message)
  revalidatePath(`/jobs/${jobId}`)
}

/** The human confirmation step — the AI can never write this field. */
export async function confirmDiagnosis(formData: FormData) {
  const { supabase, ctx } = await guard("jobs.edit")
  const jobId = String(formData.get("job_id") || "")
  const diagnosis = String(formData.get("confirmed_diagnosis") || "").trim()
  if (!jobId || !diagnosis) throw new Error("A confirmed diagnosis is required")

  const session = await getOrCreateSession(supabase, jobId, ctx.userId)
  const { error } = await supabase
    .from("diagnostic_sessions")
    .update({
      confirmed_diagnosis: diagnosis,
      confirmed_by: ctx.userId,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", session.id)
  if (error) throw new Error(error.message)

  await logAction(ctx, "diagnosis_confirmed", "job", jobId)
  revalidatePath(`/jobs/${jobId}`)
}
