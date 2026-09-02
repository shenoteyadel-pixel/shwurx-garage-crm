import { createClient } from "@/lib/supabase/server"
import { AppShell } from "@/components/app-shell"
import { NewJobForm } from "@/components/new-job-form"

export default async function NewJobPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user!.id)
    .maybeSingle()

  const { data: staff } = await supabase.from("profiles").select("id, full_name, role").order("full_name")

  return (
    <AppShell user={{ name: profile?.full_name || user!.email || "Staff", role: profile?.role || "advisor" }}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">New Job Card</h1>
          <p className="text-sm text-muted-foreground">Check in a vehicle and start the workflow.</p>
        </div>
        <NewJobForm staff={(staff ?? []) as any} />
      </div>
    </AppShell>
  )
}
