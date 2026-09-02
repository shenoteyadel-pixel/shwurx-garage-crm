import "server-only"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

// Fetches the current user's display name + role for the AppShell sidebar.
// Redirects to login when there is no authenticated user.
export async function getShellUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle()

  return {
    name: profile?.full_name || user.email || "Staff",
    role: profile?.role || "advisor",
  }
}
