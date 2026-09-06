import { createServiceClient } from "@/lib/supabase/server"
import { VehicleVisual } from "@/components/vehicle-visual"

export const dynamic = "force-dynamic"

export default async function LiftPreviewPage() {
  const svc = createServiceClient()
  const { data: jobs } = await svc
    .from("jobs")
    .select("id, job_number, vehicle_make, vehicle_model, vehicle_year, color, body_type, vehicle_reference_image_url, cover_photo_url")
    .neq("stage", "delivered")
    .order("created_at", { ascending: false })

  return (
    <div className="min-h-screen bg-background p-8 text-foreground">
      <h1 className="mb-6 font-sans text-2xl font-bold">Board image QA</h1>
      <div className="grid grid-cols-2 gap-8 md:grid-cols-3">
        {(jobs ?? []).map((j) => (
          <div key={j.id} className="space-y-2">
            <div className="text-sm text-muted-foreground">
              {j.vehicle_year} {j.vehicle_make} {j.vehicle_model} — {j.color}
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              <VehicleVisual
                coverPhoto={j.cover_photo_url}
                referenceImage={j.vehicle_reference_image_url}
                make={j.vehicle_make}
                model={j.vehicle_model}
                bodyType={j.body_type}
                color={j.color}
                className="h-24 w-full"
              />
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              <VehicleVisual
                variant="bay"
                coverPhoto={j.cover_photo_url}
                referenceImage={j.vehicle_reference_image_url}
                make={j.vehicle_make}
                model={j.vehicle_model}
                bodyType={j.body_type}
                color={j.color}
                className="h-24 w-full"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
