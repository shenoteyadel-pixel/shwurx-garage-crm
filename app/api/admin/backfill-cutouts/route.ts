import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { cutoutVehicleImage } from "@/lib/vehicle-image-cutout"

// TEMP one-off: reprocess existing vehicle reference photos into transparent
// cutouts so cars already on the board sit cleanly on the lift backdrop.
export const maxDuration = 60

export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret")
  if (secret !== "shwurx-cutout-2026") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const supabase = createServiceClient()
  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("id, vehicle_reference_image_url")
    .not("vehicle_reference_image_url", "is", null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: { id: string; changed: boolean }[] = []
  for (const j of jobs ?? []) {
    const url = j.vehicle_reference_image_url as string
    if (!url || url.includes("/cutouts/")) {
      results.push({ id: j.id, changed: false })
      continue
    }
    const cut = await cutoutVehicleImage(url)
    if (cut && cut !== url) {
      await supabase
        .from("jobs")
        .update({ vehicle_reference_image_url: cut, vehicle_image_source: "carsxe-cutout" })
        .eq("id", j.id)
      results.push({ id: j.id, changed: true })
    } else {
      results.push({ id: j.id, changed: false })
    }
  }

  return NextResponse.json({
    total: results.length,
    changed: results.filter((r) => r.changed).length,
    results,
  })
}
