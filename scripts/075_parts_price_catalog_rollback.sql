-- Rollback for 075_parts_price_catalog.sql.
-- WARNING: drops the price catalog, its revision history and emergency
-- authorization records. Export them first if they contain real data.
-- Quotation line prices and signed approval snapshots are not affected.

alter table public.approval_requests
  drop column if exists total_confirmed_amount,
  drop column if exists total_confirmed_at;

alter table public.quotation_items
  drop column if exists catalog_revision_id,
  drop column if exists catalog_id;

drop view if exists public.parts_price_current;

drop trigger if exists work_authorization_override_guard on public.work_authorization_overrides;
drop function if exists public.work_authorization_override_guard();
drop table if exists public.work_authorization_overrides;

drop trigger if exists parts_price_revision_guard on public.parts_price_revisions;
drop function if exists public.parts_price_revision_guard();
drop table if exists public.parts_price_revisions;
drop table if exists public.parts_price_catalog;
