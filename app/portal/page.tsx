import { Car, LogOut } from "lucide-react"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { loadPortalDataByCustomer } from "@/lib/portal-data"
import { PortalView } from "@/components/portal-view"
import { signOut } from "@/lib/actions"

export const metadata = { title: "Customer Portal · SHWURX Garage" }

function InfoLanding() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
          <Car className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">SHWURX Garage Customer Portal</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Track your vehicle&apos;s service progress and invoices using the secure link shared with you by our team.
        </p>
        <a
          href="/portal/login"
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Sign in to your account
        </a>
        <p className="mt-4 text-xs text-muted-foreground">
          Don&apos;t have a link yet? Please contact your service advisor and we&apos;ll send you one.
        </p>
      </div>
    </main>
  )
}

export default async function PortalPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // No session — show the informational landing.
  if (!user) return <InfoLanding />

  // Find the customer this account is linked to.
  const svc = createServiceClient()
  const { data: profile } = await svc
    .from("profiles")
    .select("customer_id, role")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile?.customer_id) return <InfoLanding />

  const data = await loadPortalDataByCustomer(profile.customer_id)
  if (!data) return <InfoLanding />

  return (
    <PortalView
      data={data}
      headerRight={
        <form action={signOut}>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </form>
      }
    />
  )
}
