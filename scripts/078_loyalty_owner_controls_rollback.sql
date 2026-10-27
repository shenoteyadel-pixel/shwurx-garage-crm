-- Rollback for 078. Keeps every points transaction; only removes the owner controls.
begin;
drop function if exists public.loyalty_owner_set_tier(uuid, text);
drop function if exists public.loyalty_owner_set_status(uuid, text);
drop function if exists public.loyalty_owner_adjust(uuid, integer, text, text);
drop function if exists public.loyalty_owner_set_note(uuid, text);
drop function if exists public.loyalty_owner_unlock(uuid);
update public.loyalty_memberships set tier_override = null where tier_override is not null;
select public.loyalty_recalculate_tier(id) from public.loyalty_memberships;
alter table public.loyalty_memberships drop column if exists tier_override, drop column if exists owner_note;
-- Self-approved adjustments stay (financial history); the relaxed constraint is kept so those rows remain valid.
commit;
