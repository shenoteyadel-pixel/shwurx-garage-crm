/**
 * One deployment-isolation policy for every website surface: CMS mutations,
 * public intake (leads, appointments, enquiries), analytics and indexing.
 *
 * - production: the real Vercel production deployment. Everything is live.
 * - isolated-test: an explicitly configured local/test database. Writes are
 *   allowed because they cannot reach production data.
 * - preview: anything else (v0 preview, Vercel preview, local dev against the
 *   shared database). Read-only; intake is dry-run; nothing is indexed/tracked.
 */
export type DeploymentMode = "production" | "isolated-test" | "preview"

export const CANONICAL_ORIGIN = "https://www.swurxauto.com"

function isLoopbackHost(raw: string | undefined): boolean {
  if (!raw) return false
  try {
    const h = new URL(raw).hostname
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "host.docker.internal"
  } catch {
    return false
  }
}

/**
 * Isolated test mode needs BOTH the explicit flag and a loopback Supabase URL,
 * so a preview that points at the production project can never enable writes by
 * flipping a single variable.
 */
export function deploymentMode(): DeploymentMode {
  if (process.env.VERCEL_ENV === "production") return "production"
  if (process.env.WEBSITE_ISOLATED_TEST === "1" && isLoopbackHost(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    return "isolated-test"
  }
  return "preview"
}

export const canMutateCms = () => deploymentMode() !== "preview"
export const canWriteIntake = () => deploymentMode() !== "preview"
export const isIndexableDeployment = () => deploymentMode() === "production"

export const PREVIEW_MUTATION_MESSAGE =
  "This preview is connected to the live database, so website changes are disabled here. Use the production Website Center, or an isolated test database (WEBSITE_ISOLATED_TEST=1 with a local Supabase URL)."

/**
 * Canonical origin. Only an https origin on swurxauto.com (or its www host) is
 * accepted from config; anything malformed falls back to the verified host.
 */
export function resolveSiteOrigin(raw = process.env.NEXT_PUBLIC_SITE_URL): string {
  const v = raw?.trim()
  if (v && /^https:\/\/[^\s/\\]+\/?$/i.test(v)) {
    try {
      const u = new URL(v)
      if (u.hostname === "www.swurxauto.com") return u.origin
    } catch {}
  }
  return CANONICAL_ORIGIN
}
