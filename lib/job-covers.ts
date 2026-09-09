import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Build a job-id → cover-image-URL map for the boards.
 *
 * Priority (highest first):
 *   1. cover_photo_url — a cover a staff member explicitly chose. Always wins.
 *   2. The newest real "vehicle" exterior/interior photo uploaded at check-in.
 *      This is a photo of the ACTUAL car, so it matches reality — unlike the
 *      AI-generated studio render, which is only an approximation.
 *
 * Jobs with neither return no entry, so the card component falls back to its
 * model-aware AI visual. Damage / parts / document photos are never used as a
 * cover — only kind = 'vehicle'.
 */
export async function buildJobCoverMap(
  supabase: SupabaseClient,
  jobs: { id: string; cover_photo_url?: string | null }[],
): Promise<Map<string, string>> {
  const cover = new Map<string, string>()

  // 1. Explicit covers win outright.
  const needsFallback: string[] = []
  for (const j of jobs) {
    if (j.cover_photo_url) cover.set(j.id, j.cover_photo_url)
    else needsFallback.push(j.id)
  }

  if (needsFallback.length === 0) return cover

  // 2. Newest real exterior photo for every remaining job, in one query.
  const { data: photos } = await supabase
    .from("vehicle_photos")
    .select("job_id, url, created_at")
    .eq("kind", "vehicle")
    .is("deleted_at", null)
    .in("job_id", needsFallback)
    .order("created_at", { ascending: false })

  for (const p of photos ?? []) {
    // First row per job is the newest thanks to the DESC order above.
    if (p.job_id && p.url && !cover.has(p.job_id)) cover.set(p.job_id, p.url)
  }

  return cover
}
