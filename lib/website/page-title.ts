/**
 * Every page appends the site suffix, except that the HOME title is left as-is
 * when it already names the brand from the suffix (e.g. "SHWURX (Wurx Garage) | …"),
 * avoiding "… | SHWURX" twice. Other pages and brand-less home titles are unchanged.
 */
export function homeAwareTitle(title: string, suffix: string, path: string): string {
  if (path !== "/" || !suffix.trim()) return title + suffix
  const brand = suffix.trim().replace(/^[|·—–-]\s*/, "").trim().toLowerCase()
  if (brand && title.toLowerCase().includes(brand)) return title.trim()
  return title + suffix
}
