import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { attachJobVehicleImage, attachVehicleMasterImage } from "@/lib/vehicle-image-attach"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Renders take 30-60s each and run in parallel, so a small batch per run keeps
// well inside the function limit; the next run picks up the rest.
const BATCH = 6

/**
 * Self-healing studio photos. A render that fails (e.g. an image model is
 * retired on AI Gateway) leaves the job with no photo and the board shows the
 * cartoon silhouette forever. This retries every active car still missing a
 * studio render. Manually chosen custom photos are never replaced.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const svc = createServiceClient()
  const { data, error } = await svc
    .from("jobs")
    .select("id, vehicle_id, vehicle_make, vehicle_model, vehicle_year, color, variant, vehicle_reference_image_url, vehicle_image_source, stage")
    .is("deleted_at", null)
    .neq("stage", "delivered")
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const missing = (data ?? []).filter(
    (j) =>
      j.vehicle_image_source !== "custom" &&
      (j.vehicle_make || j.vehicle_model) &&
      (!j.vehicle_reference_image_url || j.vehicle_image_source !== "ai-studio"),
  )

  // One render per distinct vehicle: the master-vehicle path also updates every
  // job for that car.
  const seen = new Set<string>()
  const batch = missing
    .filter((j) => {
      const k = j.vehicle_id || j.id
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .slice(0, BATCH)

  await Promise.all(
    batch.map((j) => {
      const vehicle = {
        make: j.vehicle_make,
        model: j.vehicle_model,
        year: j.vehicle_year,
        color: j.color,
        trim: j.variant,
      }
      return j.vehicle_id ? attachVehicleMasterImage(j.vehicle_id, vehicle) : attachJobVehicleImage(j.id, vehicle)
    }),
  )

  const { data: after } = await svc
    .from("jobs")
    .select("id, vehicle_image_source")
    .in("id", batch.map((j) => j.id))
  const fixed = (after ?? []).filter((j) => j.vehicle_image_source === "ai-studio").length

  return NextResponse.json({ missing: missing.length, attempted: batch.length, fixed })
}
