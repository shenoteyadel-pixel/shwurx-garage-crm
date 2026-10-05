-- 071 release recovery — DATA PRESERVING. Use this instead of any DROP.
--
-- Takes every CMS article off the public site (deletes only the published
-- snapshots in blog_posts that carry an article_key). Drafts, imported
-- bodies and the full version history in article_drafts/article_versions
-- are untouched, and each removed snapshot is still recorded in
-- article_versions (action = 'publish'), so re-publishing restores it.
-- Legacy blog_posts rows (article_key is null) are not touched.

begin;
  insert into public.article_versions (draft_id, article_key, revision, action, doc, actor)
  select d.id, d.article_key, d.revision, 'unpublish', d.doc, 'release-recovery'
    from public.article_drafts d
   where d.published_revision is not null;
  update public.article_drafts set published_revision = null where published_revision is not null;
  delete from public.blog_posts where article_key is not null;
commit;

-- To also stop new publishes until a fix ships, revoke the function:
--   revoke execute on function public.article_publish(uuid, integer, jsonb, text) from service_role;
