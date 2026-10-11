import { requirePageAccess } from "@/lib/rbac/context"

export default async function GatePassLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess(["gate_pass.release"], "Gate Pass")
  return <>{children}</>
}
