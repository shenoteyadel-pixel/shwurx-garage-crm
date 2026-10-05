/**
 * Public website path rules, shared by the proxy (routing/allowlist) and the
 * client language switch. English is unprefixed; Arabic lives under /ar.
 */
export const SITE_ROOTS = ["/brands", "/services", "/about", "/contact", "/appointment", "/blog", "/privacy", "/pages"]

export function isSitePath(p: string): boolean {
  return p === "/" || SITE_ROOTS.some((r) => p === r || p.startsWith(r + "/"))
}

export function stripLocale(pathname: string): { lang: "en" | "ar"; path: string } {
  if (pathname === "/ar") return { lang: "ar", path: "/" }
  if (pathname.startsWith("/ar/")) return { lang: "ar", path: pathname.slice(3) || "/" }
  return { lang: "en", path: pathname }
}

/** The same page in the other language, or null when the path is not a website page. */
export function switchLocalePath(pathname: string, target: "en" | "ar"): string | null {
  const { path } = stripLocale(pathname)
  if (!isSitePath(path)) return null
  if (target === "en") return path
  return path === "/" ? "/ar" : `/ar${path}`
}
