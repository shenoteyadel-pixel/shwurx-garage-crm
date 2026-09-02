import { requirePageAccess } from "@/lib/rbac/context"

export default async function VehiclesLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess(["vehicles.view"], "Vehicles")
  return <>{children}</>
}
