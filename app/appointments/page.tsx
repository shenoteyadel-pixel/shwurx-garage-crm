import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { requirePageAccess } from "@/lib/rbac/context"
import { AppShell } from "@/components/app-shell"
import { Card } from "@/components/ui"
import { CalendarClock } from "lucide-react"
import { AppointmentsBoard } from "@/components/appointments-board"
import { listDrivers, type AppointmentRow, type DriverOption } from "@/lib/actions-appointments"

export const metadata = { title: "Appointments · SHWURX Auto Service Center" }
export const dynamic = "force-dynamic"

export default async function AppointmentsPage() {
  await requirePageAccess(["appointments.view"], "Appointments")
  const user = await getShellUser()
  const supabase = await createClient()

  const { data } = await supabase
    .from("appointments")
    .select(
      "id, name, phone, email, vehicle_make, vehicle_model, vehicle_year, plate_number, service_interest, preferred_date, preferred_time, notes, source, status, customer_id, job_id, confirmed_at, cancelled_at, created_at, appointment_type, fulfillment_status, assigned_driver_id, assigned_driver_name, driver_assigned_at, pickup_address, pickup_maps_url, pickup_building, pickup_area, pickup_emirate, pickup_date, pickup_time, pickup_instructions, delivery_same_as_pickup, delivery_address, delivery_maps_url, delivery_date, delivery_time, delivery_instructions",
    )
    .order("created_at", { ascending: false })

  const appointments = (data ?? []) as AppointmentRow[]
  const canManage = user.permissions.includes("appointments.manage")
  let drivers: DriverOption[] = []
  if (canManage) {
    try {
      drivers = await listDrivers()
    } catch {
      drivers = []
    }
  }
  const activeCount = appointments.filter((a) =>
    ["pending", "confirmed", "rescheduled"].includes(a.status),
  ).length

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Appointments</h1>
            <p className="text-sm text-muted-foreground">
              {activeCount} active request{activeCount === 1 ? "" : "s"} from the website
            </p>
          </div>
        </div>

        {appointments.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <CalendarClock className="h-10 w-10 text-muted-foreground" />
            <div className="max-w-md space-y-1">
              <p className="text-sm font-medium text-foreground">No appointments yet</p>
              <p className="text-sm text-muted-foreground">
                Bookings from the SHWURX website will appear here automatically. Share the
                integration snippet in <code className="rounded bg-muted px-1">/embed/README.md</code> with
                your web developer to start receiving them.
              </p>
            </div>
          </Card>
        ) : (
          <AppointmentsBoard appointments={appointments} canManage={canManage} drivers={drivers} />
        )}
      </div>
    </AppShell>
  )
}
