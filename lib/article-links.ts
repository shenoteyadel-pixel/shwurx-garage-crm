/**
 * Availability check after safe-markdown has validated the URL. Article paths
 * must be in the server's published, locale-ready list; other links retain
 * their existing behavior. Queries and anchors do not change the target page.
 */
export function isArticleHrefAvailable(
  href: string,
  publishedArticleHrefs: ReadonlySet<string>,
  siteUrl: string,
): boolean {
  try {
    const site = new URL(siteUrl)
    const target = new URL(href, site)
    if (target.origin !== site.origin) return true
    const pathname = target.pathname.replace(/\/+$/, "")
    if (!/^\/(?:ar\/)?blog\//.test(pathname)) return true
    return publishedArticleHrefs.has(pathname)
  } catch {
    return false
  }
}
