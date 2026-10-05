-- 050_website_cms.sql
-- Website Control Center: draft / publish / revisions + lead submission dedupe
-- + bilingual blog columns. Additive only; nothing existing is dropped.
-- Apply to an ISOLATED database first, test, then production.
-- Rollback: scripts/050_website_cms_rollback.sql

begin;

create table if not exists public.website_documents (
  id int primary key default 1 check (id = 1),
  draft jsonb not null,
  draft_version int not null default 1,
  published_revision_id bigint,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_name text
);

create table if not exists public.website_revisions (
  id bigserial primary key,
  document jsonb not null,
  draft_version int not null,
  kind text not null check (kind in ('published', 'restored', 'imported', 'backup')),
  note text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now()
);

alter table public.website_documents
  drop constraint if exists website_documents_published_fk;
alter table public.website_documents
  add constraint website_documents_published_fk
  foreign key (published_revision_id) references public.website_revisions(id);

-- Service-role only: RLS on, no policies for anon/authenticated.
alter table public.website_documents enable row level security;
alter table public.website_revisions enable row level security;
revoke all on public.website_documents from anon, authenticated;
revoke all on public.website_revisions from anon, authenticated;

-- Atomic save with optimistic concurrency. Returns the new version or a conflict.
create or replace function public.website_save_draft(
  p_expected_version int, p_draft jsonb, p_user uuid, p_user_name text
) returns json
language plpgsql security definer set search_path to ''
as $$
declare v_version int;
begin
  update public.website_documents
     set draft = p_draft,
         draft_version = draft_version + 1,
         updated_at = now(),
         updated_by = p_user,
         updated_by_name = left(p_user_name, 160)
   where id = 1 and draft_version = p_expected_version
  returning draft_version into v_version;
  if v_version is null then
    select draft_version into v_version from public.website_documents where id = 1;
    return json_build_object('ok', false, 'error', 'conflict', 'current_version', v_version);
  end if;
  return json_build_object('ok', true, 'version', v_version);
end; $$;

-- Atomic publish: snapshot the exact draft version into an immutable revision
-- and point the live pointer at it in one transaction.
create or replace function public.website_publish(
  p_expected_version int, p_user uuid, p_user_name text, p_note text
) returns json
language plpgsql security definer set search_path to ''
as $$
declare v_row public.website_documents; v_rev bigint;
begin
  select * into v_row from public.website_documents where id = 1 for update;
  if not found then
    return json_build_object('ok', false, 'error', 'not_initialised');
  end if;
  if v_row.draft_version <> p_expected_version then
    return json_build_object('ok', false, 'error', 'conflict', 'current_version', v_row.draft_version);
  end if;
  insert into public.website_revisions (document, draft_version, kind, note, created_by, created_by_name)
  values (v_row.draft, v_row.draft_version, 'published', left(p_note, 500), p_user, left(p_user_name, 160))
  returning id into v_rev;
  update public.website_documents set published_revision_id = v_rev where id = 1;
  return json_build_object('ok', true, 'revision_id', v_rev);
end; $$;

revoke all on function public.website_save_draft(int, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.website_publish(int, uuid, text, text) from public, anon, authenticated;

-- Retry-safe website intake: one lead per client submission id.
create unique index if not exists leads_submission_id_uniq
  on public.leads ((metadata->>'submission_id'))
  where metadata ? 'submission_id';

-- Bilingual blog: locale + a shared group id linking EN/AR translations.
alter table public.blog_posts add column if not exists locale text not null default 'en'
  check (locale in ('en', 'ar'));
alter table public.blog_posts add column if not exists translation_group uuid;

commit;
