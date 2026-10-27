-- Rollback for 077_loyalty_rewards.sql. Drops only loyalty objects; existing CRM tables are untouched.
-- WARNING: deletes the loyalty ledger. Take a backup first.
begin;
drop trigger if exists loyalty_payments_trigger on public.payments;
drop trigger if exists loyalty_invoices_trigger on public.invoices;
drop table if exists public.reminder_delivery_logs, public.reminder_events, public.vehicle_service_schedules,
  public.customer_notification_preferences, public.wallet_passes, public.loyalty_processing_errors,
  public.loyalty_adjustments, public.loyalty_redemptions, public.loyalty_transactions,
  public.loyalty_memberships, public.loyalty_rule_changes, public.loyalty_rules cascade;
drop sequence if exists public.loyalty_membership_seq;
do $$
declare f record;
begin
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like 'loyalty%' or p.proname like '\_loyalty%')
  loop execute format('drop function if exists %s cascade', f.sig); end loop;
end $$;
delete from public.role_permissions where permission like 'loyalty.%';
commit;
