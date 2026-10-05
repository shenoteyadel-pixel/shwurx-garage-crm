-- 071 release recovery (rev 2) — DATA PRESERVING. Use this instead of any DROP.
--
-- Takes every CMS article off the public site in ONE transaction:
--   1. Locks drafts so no publish/unpublish can interleave.
--   2. Snapshots every CMS blog_posts row (article_key not null) into
--      article_versions as action 'recovery' — including orphans whose
--      article_key has no draft (draft_id null) — before deleting it.
--   3. Clears published_revision and bumps revision on affected drafts so any
--      in-flight editor CAS fails instead of re-publishing stale state.
-- Drafts and history are never deleted. Legacy rows (article_key null) are
-- not touched. Re-running is safe: a second run finds nothing to snapshot.

begin;
  lock table public.article_drafts in share row exclusive mode;
  lock table public.blog_posts in share row exclusive mode;

  insert into public.article_versions (draft_id, article_key, revision, action, doc, actor)
  select d.id, p.article_key, coalesce(d.revision, coalesce(p.revision, 0)) + case when d.id is null then 0 else 1 end,
         'recovery', to_jsonb(p.*), 'release-recovery'
    from public.blog_posts p
    left join public.article_drafts d on d.article_key = p.article_key
   where p.article_key is not null;

  update public.article_drafts
     set revision = revision + 1, published_revision = null, updated_at = now(), updated_by = 'release-recovery'
   where published_revision is not null
      or article_key in (select article_key from public.blog_posts where article_key is not null);

  delete from public.blog_posts where article_key is not null;
commit;

-- To also stop new publishes until a fix ships:
--   revoke execute on function public.article_publish(uuid, integer, jsonb, text) from service_role;
