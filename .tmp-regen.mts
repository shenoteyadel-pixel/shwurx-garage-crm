import { generateVehicleImage } from "./lib/vehicle-image-generate.ts"
import { createClient } from "@supabase/supabase-js"
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const KEEP = "4854a9a0"
const { data: vehicles } = await sb.from("vehicles").select("id,year,make,model,color,variant,reference_image_url").eq("image_source", "ai-studio")
const { data: jobs } = await sb.from("jobs").select("id,vehicle_id,vehicle_year,vehicle_make,vehicle_model,variant,vehicle_reference_image_url").eq("vehicle_image_source", "ai-studio").is("vehicle_id", null)
type T = { kind: "v" | "j"; id: string; year: number | null; make: string; model: string; color: string | null; trim: string | null }
const tasks: T[] = [
  ...(vehicles ?? []).filter(v => !v.reference_image_url?.includes(KEEP) && v.make && v.model).map(v => ({ kind: "v" as const, id: v.id, year: v.year, make: v.make, model: v.model, color: v.color, trim: v.variant })),
  ...(jobs ?? []).filter(j => j.vehicle_make && j.vehicle_model).map(j => ({ kind: "j" as const, id: j.id, year: j.vehicle_year, make: j.vehicle_make, model: j.vehicle_model, color: null, trim: j.variant })),
]
console.log("tasks", tasks.length)
let i = 0, ok = 0
async function worker() {
  while (i < tasks.length) {
    const t = tasks[i++]
    try {
      const url = await generateVehicleImage({ year: t.year, make: t.make, model: t.model, color: t.color, trim: t.trim })
      if (!url) { console.log("FAIL", t.make, t.model); continue }
      if (t.kind === "v") {
        await sb.from("vehicles").update({ reference_image_url: url, image_resolved_at: new Date().toISOString() }).eq("id", t.id)
        await sb.from("jobs").update({ vehicle_reference_image_url: url }).eq("vehicle_id", t.id)
      } else await sb.from("jobs").update({ vehicle_reference_image_url: url }).eq("id", t.id)
      ok++; console.log("OK", ok, t.year, t.make, t.model, t.color)
    } catch (e) { console.log("ERR", t.make, t.model, (e as Error).message) }
  }
}
await Promise.all([worker(), worker(), worker(), worker(), worker()])
console.log("DONE", ok, "/", tasks.length)
