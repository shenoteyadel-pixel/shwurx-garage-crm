import { attachVehicleMasterImage } from "@/lib/vehicle-image-attach"
import { createServiceClient } from "@/lib/supabase/server"
const ids = ["6b76dc19-af96-4908-af7f-c3593f1687ad","10b6c279-61c4-495c-b888-79811d2d7dfa","5e962fa1-2dff-4a03-bafc-87a9114245fe","18c09509-c403-48f4-8f8f-e145b1bfb534","8f0aa2e9-b895-42d4-821b-83802eeef6de","07b52c9a-d977-4d58-b329-caa7b4bd0108","cfd5856e-ae3c-43e0-a2ee-5076b675a18e","904b1a4c-ac16-45d7-a9d7-bdbb6aea4afd","e9d800df-887b-49e3-ae85-8d553cb8fa19","cbbc7e3a-f2a4-4f7d-9c85-fd0d33e7fd0b","44e13b88-4c13-432e-97d4-13595d4dd9dd","5d8dbd64-859b-4b79-a046-c4439b081daa","d43448d2-462f-4a15-8a88-9b4a0ba1aa7e","0ce7d2db-0502-4927-8198-8bcf6d8bdd50"]
async function main() {
  const svc = createServiceClient()
  const { data } = await svc.from("vehicles").select("id,make,model,variant,year,color").in("id", ids)
  const queue = [...(data ?? [])]
  let n = 0
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const v = queue.shift()!
      await attachVehicleMasterImage(v.id, { make: v.make, model: v.model, year: v.year, color: v.color, trim: v.variant })
      console.log("done", ++n, v.make, v.model)
    }
  }))
}
main().then(() => console.log("ALL DONE"))
