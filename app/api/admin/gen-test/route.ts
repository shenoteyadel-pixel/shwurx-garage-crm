import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { attachJobVehicleImage } from "@/lib/vehicle-image-attach"

export const maxDuration = 300

// TEMP: regenerate the uniform AI studio image for every active job card.
export async function GET(req: Request) {
  const url = new URL(req.url)
  if (url.searchParams.get("secret") !== "shwurx-gen-2026") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }
  const onlyMissing = url.searchParams.get("all") !== "1"
  const svc = createServiceClient()
  const { data: jobs, error } = await svc
    .from("jobs")
    .select("id, job_number, vehicle_make, vehicle_model, vehicle_year, color, vehicle_image_source, vehicle_reference_image_url")
    .neq("stage", "delivered")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const targets = (jobs ?? []).filter((j) => {
    if (j.vehicle_image_source === "custom") return false
    if (onlyMissing && j.vehicle_reference_image_url) return false
    return true
  })
  const t = Date.now()
  const results = await Promise.all(
    targets.map(async (j) => {
      await attachJobVehicleImage(j.id, {
        make: j.vehicle_make,
        model: j.vehicle_model,
        year: j.vehicle_year,
        color: j.color,
      })
      const { data: after } = await svc
        .from("jobs")
        .select("vehicle_reference_image_url")
        .eq("id", j.id)
        .single()
      const label = `${j.job_number}: ${j.vehicle_year ?? ""} ${j.vehicle_make ?? ""} ${j.vehicle_model ?? ""}`.trim()
      return { label, ok: !!after?.vehicle_reference_image_url }
    }),
  )
  return NextResponse.json({ ok: true, ms: Date.now() - t, results })
}
