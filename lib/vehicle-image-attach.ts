import "server-only"
import { revalidatePath } from "next/cache"
import { createServiceClient } from "@/lib/supabase/server"
import { resolveVehicleImage } from "@/lib/vehicle-image"

/**
 * Generate the uniform AI studio image for a job and write it onto the row.
 * Designed to run in the BACKGROUND (via `after()`), because generation takes
 * ~30-60s and must never block an interactive action like "New Job Card" or
 * converting a booking. Uses the service client so the write succeeds outside
 * the original request's RLS/cookie scope, and never clobbers a manually
 * chosen custom photo. The board shows the silhouette until this lands, then
 * the real photo on the next render.
 */
export async function attachJobVehicleImage(
  jobId: string,
  vehicle: { make: string | null; model: string | null; year: number | null; color: string | null },
): Promise<void> {
  try {
    const image = await resolveVehicleImage(vehicle)
    if (!image) return
    const svc = createServiceClient()
    await svc
      .from("jobs")
      .update({
        vehicle_reference_image_url: image.url,
        vehicle_image_source: image.source,
        vehicle_image_resolved_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .neq("vehicle_image_source", "custom")
    revalidatePath("/crm")
    revalidatePath("/flow")
    revalidatePath(`/jobs/${jobId}`)
  } catch (err) {
    console.log("[v0] attachJobVehicleImage failed:", (err as Error).message)
  }
}
