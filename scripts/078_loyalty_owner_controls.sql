-- 078: Owner controls for loyalty cards (tier override, status, direct point adjustments, notes, unlock).
-- Additive only: new nullable columns, a relaxed check constraint and new owner-only functions.
begin;

alter table public.loyalty_memberships
  add column if not exists tier_override text check (tier_override in ('member', 'silver', 'vip')),
  add column if not exists owner_note text check (owner_note is null or length(owner_note) <= 500);

alter table public.loyalty_adjustments
  add column if not exists self_approved boolean not null default false;

-- The Owner may approve their own adjustment; everyone else still needs a second approver.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.loyalty_adjustments'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%decided_by <> requested_by%'
       and conname <> 'loyalty_adjustments_separation_of_duties'
  loop
    execute format('alter table public.loyalty_adjustments drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.loyalty_adjustments drop constraint if exists loyalty_adjustments_separation_of_duties;
alter table public.loyalty_adjustments add constraint loyalty_adjustments_separation_of_duties
  check (self_approved or decided_by is null or decided_by <> requested_by);

-- Tier now honours an Owner override; spend is still tracked so "Automatic" can be restored at any time.
create or replace function public.loyalty_recalculate_tier(p_membership uuid)
returns text language plpgsql security definer set search_path to '' as $$
declare
  r public.loyalty_rules;
  spend numeric;
  auto_tier text;
  new_tier text;
  forced text;
begin
  select * into r from public.loyalty_rules where id = 1;
  select coalesce(sum(eligible_aed), 0) into spend
    from public.loyalty_transactions
    where membership_id = p_membership and kind in ('earn', 'earn_reversal')
      and created_at >= now() - interval '12 months';
  spend := greatest(spend, 0);
  auto_tier := case when spend >= r.vip_threshold_aed then 'vip'
                    when spend >= r.silver_threshold_aed then 'silver' else 'member' end;
  select tier_override into forced from public.loyalty_memberships where id = p_membership;
  new_tier := coalesce(forced, auto_tier);
  update public.loyalty_memberships
     set rolling_spend_aed = spend,
         tier_updated_at = case when tier <> new_tier then now() else tier_updated_at end,
         tier = new_tier, updated_at = now()
   where id = p_membership;
  perform public._loyalty_flag_wallet(p_membership);
  return new_tier;
end $$;

create or replace function public.loyalty_owner_set_tier(p_membership uuid, p_tier text)
returns text language plpgsql security definer set search_path to '' as $$
begin
  if public.auth_role() is distinct from 'owner' then raise exception 'Only the Owner can change a card tier'; end if;
  if p_tier is not null and p_tier not in ('member', 'silver', 'vip') then raise exception 'Invalid tier'; end if;
  update public.loyalty_memberships set tier_override = p_tier, updated_at = now() where id = p_membership;
  if not found then raise exception 'Card not found'; end if;
  return public.loyalty_recalculate_tier(p_membership);
end $$;

create or replace function public.loyalty_owner_set_status(p_membership uuid, p_status text)
returns integer language plpgsql security definer set search_path to '' as $$
declare
  m public.loyalty_memberships;
  awarded integer := 0;
begin
  if public.auth_role() is distinct from 'owner' then raise exception 'Only the Owner can change a card status'; end if;
  if p_status not in ('invited', 'active', 'suspended', 'closed') then raise exception 'Invalid status'; end if;
  select * into m from public.loyalty_memberships where id = p_membership for update;
  if m.id is null then raise exception 'Card not found'; end if;
  update public.loyalty_memberships
     set status = p_status,
         enrolled_at = case when p_status = 'active' and enrolled_at is null then now() else enrolled_at end,
         enrolled_via = case when p_status = 'active' and enrolled_at is null then 'owner' else enrolled_via end,
         enroll_failed_attempts = case when p_status = 'active' then 0 else enroll_failed_attempts end,
         updated_at = now()
   where id = m.id;
  if p_status = 'active' and m.enrolled_at is null then
    awarded := public._loyalty_award_retro(m.id);
  end if;
  return awarded;
end $$;

create or replace function public.loyalty_owner_adjust(p_membership uuid, p_points integer, p_reason text, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  existing uuid;
  new_id uuid;
  r public.loyalty_rules;
begin
  if public.auth_role() is distinct from 'owner' then raise exception 'Only the Owner can adjust points directly'; end if;
  if p_points is null or p_points = 0 or abs(p_points) > 1000000 then raise exception 'Invalid points'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Reason must be at least 5 characters'; end if;
  select id into existing from public.loyalty_adjustments where idempotency_key = p_idempotency_key;
  if existing is not null then return existing; end if;
  insert into public.loyalty_adjustments
    (membership_id, points, reason, status, requested_by, decided_by, decided_at, decision_note, self_approved, idempotency_key)
  values (p_membership, p_points, trim(p_reason), 'approved', auth.uid(), auth.uid(), now(), 'Owner direct adjustment', true, p_idempotency_key)
  returning id into new_id;
  select * into r from public.loyalty_rules where id = 1;
  if p_points > 0 then
    perform public._loyalty_credit(p_membership, 'adjust', p_points, 'adjust:' || new_id,
      now() + make_interval(months => r.expiry_months), p_adjustment => new_id, p_reason => trim(p_reason));
  else
    perform public._loyalty_debit(p_membership, 'adjust', -p_points, 'adjust:' || new_id, false,
      p_adjustment => new_id, p_reason => trim(p_reason));
  end if;
  return new_id;
end $$;

create or replace function public.loyalty_owner_set_note(p_membership uuid, p_note text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if public.auth_role() is distinct from 'owner' then raise exception 'Only the Owner can edit card notes'; end if;
  update public.loyalty_memberships set owner_note = nullif(trim(p_note), ''), updated_at = now() where id = p_membership;
end $$;

create or replace function public.loyalty_owner_unlock(p_membership uuid)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if public.auth_role() is distinct from 'owner' then raise exception 'Only the Owner can unlock a card'; end if;
  update public.loyalty_memberships set enroll_failed_attempts = 0, updated_at = now() where id = p_membership;
end $$;

revoke all on function public.loyalty_owner_set_tier(uuid, text), public.loyalty_owner_set_status(uuid, text),
  public.loyalty_owner_adjust(uuid, integer, text, text), public.loyalty_owner_set_note(uuid, text),
  public.loyalty_owner_unlock(uuid) from public, anon;
grant execute on function public.loyalty_owner_set_tier(uuid, text), public.loyalty_owner_set_status(uuid, text),
  public.loyalty_owner_adjust(uuid, integer, text, text), public.loyalty_owner_set_note(uuid, text),
  public.loyalty_owner_unlock(uuid) to authenticated;

commit;
