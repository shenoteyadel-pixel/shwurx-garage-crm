-- Fix: website bookings saved but invisible in the CRM.
--
-- Root cause: the `appointments` table had row-level security ENABLED but ZERO
-- policies. The public website writes through the `submit_appointment`
-- SECURITY DEFINER RPC (which bypasses RLS, so rows were saved correctly), but
-- the CRM reads/updates as the logged-in `authenticated` staff user. With RLS
-- on and no policy, that role can see NOTHING, so the Appointments page showed
-- "0 active requests" even though bookings existed.
--
-- Fix: add policies mirroring the peer tables (jobs, customers, vehicles),
-- gated on the existing `has_perm(...)` helper and the appointment permissions.
-- This is additive only — it creates policies and does not touch any data.
-- Safe to run multiple times (drops policy if exists first).

alter table public.appointments enable row level security;

-- Staff who can view appointments can read every booking.
drop policy if exists appointments_select on public.appointments;
create policy appointments_select on public.appointments
  for select to public
  using (has_perm('appointments.view'));

-- Staff who can manage appointments can insert (staff-created bookings).
-- The public website continues to insert via the SECURITY DEFINER RPC.
drop policy if exists appointments_insert on public.appointments;
create policy appointments_insert on public.appointments
  for insert to public
  with check (has_perm('appointments.manage'));

-- Staff who can manage appointments can update them (confirm, reschedule,
-- cancel, assign driver, fulfillment status, link to job on convert).
drop policy if exists appointments_update on public.appointments;
create policy appointments_update on public.appointments
  for update to public
  using (has_perm('appointments.manage'))
  with check (has_perm('appointments.manage'));

-- No DELETE policy is created on purpose: nothing in the app deletes
-- appointments, and we never want website bookings removed.
