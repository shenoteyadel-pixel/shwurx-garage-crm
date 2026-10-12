import "server-only"
import { revalidatePath } from "next/cache"
import { createServiceClient } from "@/lib/supabase/server"
import { notifyGateTeam } from "@/lib/job-notify"

function genPassNumber() {
  const d = new Date()
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
  return `GP-${ymd}-${Math.floor(1000 + Math.random() * 9000)}`
}

/**
 * Issue the vehicle's boarding (gate) pass once the job is fully paid, then
 * alert gate security and the job's advisor so they can hand over the keys.
 * Idempotent: a job only ever gets one pass. Best-effort — never blocks payment.
 */
export async function issueGatePass(
  jobId: string,
  opts: { amount?: number | null; method?: string | null; issuedBy?: string | null } = {},
) {
  try {
    const svc = createServiceClient()
    const { data: existing } = await svc.from("gate_passes").select("id").eq("job_id", jobId).maybeSingle()
    if (existing) return

    let passNumber = ""
    for (let attempt = 0; attempt < 3; attempt++) {
      passNumber = genPassNumber()
      const { error } = await svc.from("gate_passes").insert({
        job_id: jobId,
        pass_number: passNumber,
        issued_by: opts.issuedBy ?? null,
        amount_paid: opts.amount ?? null,
        payment_method: opts.method ?? null,
      })
      if (!error) break
      // job_id conflict = another request already issued it.
      if (error.message.includes("job_id")) return
      if (attempt === 2) throw error
    }

    const { data: job } = await svc
      .from("jobs")
      .select("customer_name, vehicle_make, vehicle_model, plate_code, plate_number")
      .eq("id", jobId)
      .maybeSingle()
    const vehicle = [job?.vehicle_make, job?.vehicle_model].filter(Boolean).join(" ")
    const plate = [job?.plate_code, job?.plate_number].filter(Boolean).join(" ")

    await notifyGateTeam(jobId, (label) => ({
      title: `Gate pass ${passNumber} — keys ready to release`,
      body: `${label}: ${job?.customer_name ?? "Customer"} has paid. ${vehicle}${plate ? ` (${plate})` : ""} can be handed over.`,
      type: "success",
      link: "/gate-pass",
    }))
    revalidatePath("/gate-pass")
  } catch (e) {
    console.error("[gate-pass] issue failed", e)
  }
}
