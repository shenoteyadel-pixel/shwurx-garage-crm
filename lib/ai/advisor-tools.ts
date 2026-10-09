import "server-only"
import { tool } from "ai"
import { z } from "zod"
import { createServiceClient } from "@/lib/supabase/server"
import { STAGE_MAP, type Stage } from "@/lib/constants"

const OPEN_PART_STATUSES = ["required", "ordered"]

function dubaiToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date())
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

// PostgREST `.or()` filters are comma/paren-delimited, so strip those before interpolating user text.
function cleanTerm(raw: string): string {
  return raw.replace(/[,()%*\\]/g, " ").trim().slice(0, 60)
}

function plate(j: { plate_emirate?: string | null; plate_code?: string | null; plate_number?: string | null }) {
  return [j.plate_emirate, j.plate_code, j.plate_number].filter(Boolean).join(" ") || null
}

function stageLabel(stage: string) {
  return STAGE_MAP[stage as Stage]?.label ?? stage
}

const JOB_COLS =
  "id, job_number, stage, customer_name, customer_mobile, vehicle_make, vehicle_model, vehicle_year, plate_emirate, plate_code, plate_number, estimated_completion, created_at, updated_at, approval_status"

export function createAdvisorTools() {
  const db = createServiceClient()

  return {
    find_vehicle: tool({
      description:
        "Find a car or customer by plate number, VIN, customer name or mobile. Returns matching vehicles with owner and their most recent job cards.",
      inputSchema: z.object({ query: z.string().min(2).describe("Plate, VIN, customer name or mobile (partial is fine)") }),
      execute: async ({ query }) => {
        const q = cleanTerm(query)
        if (q.length < 2) return { results: [] }
        const [{ data: vehicles }, { data: customers }] = await Promise.all([
          db
            .from("vehicles")
            .select("id, customer_id, make, model, year, color, plate_emirate, plate_code, plate_number, vin, mileage")
            .or(`plate_number.ilike.%${q}%,vin.ilike.%${q}%`)
            .limit(5),
          db
            .from("customers")
            .select("id, full_name, mobile, email")
            .or(`full_name.ilike.%${q}%,mobile.ilike.%${q}%`)
            .limit(5),
        ])

        const customerIds = new Set<string>([
          ...(customers ?? []).map((c) => c.id),
          ...(vehicles ?? []).map((v) => v.customer_id).filter(Boolean),
        ])
        const ids = [...customerIds].slice(0, 8)
        if (ids.length === 0) return { results: [] }

        const [{ data: owners }, { data: ownedVehicles }, { data: jobs }] = await Promise.all([
          db.from("customers").select("id, full_name, mobile, email").in("id", ids),
          db
            .from("vehicles")
            .select("id, customer_id, make, model, year, plate_emirate, plate_code, plate_number, vin, mileage")
            .in("customer_id", ids),
          db
            .from("jobs")
            .select("job_number, stage, vehicle_make, vehicle_model, created_at, customer_id")
            .in("customer_id", ids)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(30),
        ])

        const results = (owners ?? []).map((c) => ({
          customer: { name: c.full_name, mobile: c.mobile, email: c.email },
          vehicles: (ownedVehicles ?? [])
            .filter((v) => v.customer_id === c.id)
            .map((v) => ({ id: v.id, car: `${v.year ?? ""} ${v.make ?? ""} ${v.model ?? ""}`.trim(), plate: plate(v), vin: v.vin, mileage: v.mileage })),
          recentJobs: (jobs ?? [])
            .filter((j) => j.customer_id === c.id)
            .slice(0, 5)
            .map((j) => ({ jobNumber: j.job_number, stage: stageLabel(j.stage), car: `${j.vehicle_make ?? ""} ${j.vehicle_model ?? ""}`.trim(), openedOn: j.created_at?.slice(0, 10) })),
        }))
        return { results }
      },
    }),

    get_job: tool({
      description:
        "Full detail of one job card by job number: complaint, diagnosis, stage, days in workshop, parts status, quotation approval, and invoice/payment status.",
      inputSchema: z.object({ jobNumber: z.string().min(1) }),
      execute: async ({ jobNumber }) => {
        const { data: job } = await db
          .from("jobs")
          .select(
            "id, job_number, stage, customer_name, customer_mobile, vehicle_make, vehicle_model, vehicle_year, plate_emirate, plate_code, plate_number, estimated_completion, created_at, mileage, complaint, diagnosis, repair_instructions, technician_notes, qc_status, lift_bay",
          )
          .ilike("job_number", cleanTerm(jobNumber))
          .is("deleted_at", null)
          .maybeSingle()
        if (!job) return { found: false }

        const [{ data: parts }, { data: approvals }, { data: invoices }] = await Promise.all([
          db.from("parts_requests").select("part_name, quantity, status, supplier").eq("job_id", job.id).is("deleted_at", null),
          db
            .from("approval_requests")
            .select("status, total, approved_total, signer_name, sent_at, decided_at, certificate_number")
            .eq("job_id", job.id)
            .neq("status", "superseded")
            .order("created_at", { ascending: false })
            .limit(1),
          db.from("invoices").select("invoice_number, status, total, amount_paid, issue_date").eq("job_id", job.id),
        ])

        const today = dubaiToday()
        return {
          found: true,
          job: {
            jobNumber: job.job_number,
            stage: stageLabel(job.stage),
            customer: job.customer_name,
            mobile: job.customer_mobile,
            car: `${job.vehicle_year ?? ""} ${job.vehicle_make ?? ""} ${job.vehicle_model ?? ""}`.trim(),
            plate: plate(job),
            mileage: job.mileage,
            liftBay: job.lift_bay,
            complaint: job.complaint,
            diagnosis: job.diagnosis,
            repairInstructions: job.repair_instructions,
            technicianNotes: job.technician_notes,
            qcStatus: job.qc_status,
            daysInWorkshop: daysSince(job.created_at),
            promisedDate: job.estimated_completion,
            overdue: !!job.estimated_completion && job.estimated_completion < today && job.stage !== "delivered",
          },
          parts: (parts ?? []).map((p) => ({ name: p.part_name, qty: p.quantity, status: p.status, supplier: p.supplier })),
          quotation: approvals?.[0] ?? null,
          invoices: (invoices ?? []).map((i) => ({
            number: i.invoice_number,
            status: i.status,
            total: Number(i.total),
            balanceDue: Math.max(0, Number(i.total) - Number(i.amount_paid || 0)),
          })),
          link: `/jobs/${job.id}`,
        }
      },
    }),

    workshop_board: tool({
      description:
        "Live overview of every car currently in the workshop (not delivered): counts per stage, cars overdue against the promised date, and cars sitting longest.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data: jobs } = await db
          .from("jobs")
          .select(JOB_COLS)
          .neq("stage", "delivered")
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
          .limit(300)
        const today = dubaiToday()
        const list = (jobs ?? []).map((j) => ({
          jobNumber: j.job_number,
          stage: stageLabel(j.stage),
          customer: j.customer_name,
          car: `${j.vehicle_make ?? ""} ${j.vehicle_model ?? ""}`.trim(),
          plate: plate(j),
          daysInWorkshop: daysSince(j.created_at),
          daysSinceUpdate: daysSince(j.updated_at),
          promisedDate: j.estimated_completion,
          overdue: !!j.estimated_completion && j.estimated_completion < today,
        }))
        const byStage: Record<string, number> = {}
        for (const j of list) byStage[j.stage] = (byStage[j.stage] ?? 0) + 1
        return {
          today,
          carsInWorkshop: list.length,
          byStage,
          overdue: list.filter((j) => j.overdue),
          longestInWorkshop: [...list].sort((a, b) => (b.daysInWorkshop ?? 0) - (a.daysInWorkshop ?? 0)).slice(0, 10),
          stuck: list.filter((j) => (j.daysSinceUpdate ?? 0) >= 3).slice(0, 15),
        }
      },
    }),

    jobs_in_stage: tool({
      description: "List the cars currently in one workshop stage, e.g. customer_approval to see who still has to approve a quotation.",
      inputSchema: z.object({
        stage: z.enum([
          "check_in",
          "inspection",
          "quotation",
          "customer_approval",
          "parts_required",
          "parts_ordered",
          "parts_received",
          "repair",
          "quality_control",
          "washing",
          "ready_for_delivery",
        ]),
      }),
      execute: async ({ stage }) => {
        const { data: jobs } = await db
          .from("jobs")
          .select(JOB_COLS)
          .eq("stage", stage)
          .is("deleted_at", null)
          .order("updated_at", { ascending: true })
          .limit(50)
        return {
          stage: stageLabel(stage),
          jobs: (jobs ?? []).map((j) => ({
            jobNumber: j.job_number,
            customer: j.customer_name,
            mobile: j.customer_mobile,
            car: `${j.vehicle_make ?? ""} ${j.vehicle_model ?? ""}`.trim(),
            plate: plate(j),
            daysInThisStageApprox: daysSince(j.updated_at),
            promisedDate: j.estimated_completion,
          })),
        }
      },
    }),

    parts_waiting: tool({
      description: "Parts still required or on order for open jobs, so the advisor knows which cars are blocked on parts.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data: parts } = await db
          .from("parts_requests")
          .select("part_name, quantity, status, supplier, created_at, job_id")
          .in("status", OPEN_PART_STATUSES)
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
          .limit(100)
        const jobIds = [...new Set((parts ?? []).map((p) => p.job_id))]
        const { data: jobs } = jobIds.length
          ? await db.from("jobs").select("id, job_number, vehicle_make, vehicle_model, stage").in("id", jobIds).is("deleted_at", null).neq("stage", "delivered")
          : { data: [] }
        const jobMap = new Map((jobs ?? []).map((j) => [j.id, j]))
        return {
          parts: (parts ?? [])
            .filter((p) => jobMap.has(p.job_id))
            .map((p) => {
              const j = jobMap.get(p.job_id)!
              return {
                jobNumber: j.job_number,
                car: `${j.vehicle_make ?? ""} ${j.vehicle_model ?? ""}`.trim(),
                part: p.part_name,
                qty: p.quantity,
                status: p.status,
                supplier: p.supplier,
                waitingDays: daysSince(p.created_at),
              }
            }),
        }
      },
    }),

    appointments_on: tool({
      description: "Appointments booked for a date (defaults to today, Dubai time), including pickup/delivery details.",
      inputSchema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD") }),
      execute: async ({ date }) => {
        const day = date ?? dubaiToday()
        const { data } = await db
          .from("appointments")
          .select("name, phone, vehicle_make, vehicle_model, plate_number, service_interest, preferred_time, status, appointment_type, pickup_area, notes, job_id")
          .eq("preferred_date", day)
          .neq("status", "cancelled")
          .order("preferred_time", { ascending: true })
        return {
          date: day,
          appointments: (data ?? []).map((a) => ({
            customer: a.name,
            phone: a.phone,
            car: `${a.vehicle_make ?? ""} ${a.vehicle_model ?? ""}`.trim(),
            plate: a.plate_number,
            service: a.service_interest,
            time: a.preferred_time,
            status: a.status,
            type: a.appointment_type,
            pickupArea: a.pickup_area,
            notes: a.notes,
            checkedIn: !!a.job_id,
          })),
        }
      },
    }),

    vehicle_history: tool({
      description: "Past service history for one car by plate number or VIN: previous job cards, complaints, mileage and invoices.",
      inputSchema: z.object({ plateOrVin: z.string().min(2) }),
      execute: async ({ plateOrVin }) => {
        const q = cleanTerm(plateOrVin)
        const { data: jobs } = await db
          .from("jobs")
          .select("id, job_number, stage, created_at, mileage, complaint, diagnosis, vehicle_make, vehicle_model, plate_number, vin")
          .or(`plate_number.ilike.%${q}%,vin.ilike.%${q}%`)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(15)
        const ids = (jobs ?? []).map((j) => j.id)
        const { data: invoices } = ids.length
          ? await db.from("invoices").select("job_id, invoice_number, status, total, amount_paid").in("job_id", ids)
          : { data: [] }
        return {
          visits: (jobs ?? []).map((j) => ({
            jobNumber: j.job_number,
            date: j.created_at?.slice(0, 10),
            stage: stageLabel(j.stage),
            car: `${j.vehicle_make ?? ""} ${j.vehicle_model ?? ""}`.trim(),
            mileage: j.mileage,
            complaint: j.complaint,
            diagnosis: j.diagnosis,
            invoices: (invoices ?? [])
              .filter((i) => i.job_id === j.id)
              .map((i) => ({ number: i.invoice_number, status: i.status, total: Number(i.total), balanceDue: Math.max(0, Number(i.total) - Number(i.amount_paid || 0)) })),
          })),
        }
      },
    }),
  }
}
