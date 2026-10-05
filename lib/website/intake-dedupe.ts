import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { publicPath, sanitizeAttribution } from "./intake-attribution"

export const SUBMISSION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Existing record for this browser submission id, if one was already persisted. */
export async function findBySubmission(table: "leads" | "appointments", submissionId: string): Promise<string | null> {
  try {
    const { data } = await createServiceClient()
      .from(table)
      .select("id")
      .eq("metadata->>submission_id", submissionId)
      .limit(1)
      .maybeSingle()
    return (data?.id as string | undefined) ?? null
  } catch {
    return null
  }
}

/**
 * Client metadata with reserved keys replaced by server-validated values, so a
 * caller cannot inject its own attribution, submission id or form identity.
 */
export function intakeMetadata(
  body: Record<string, unknown>,
  formKey: string,
  submissionId: string | null,
  allowClientKeys: string[],
): Record<string, unknown> {
  const client = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? (body.metadata as Record<string, unknown>) : {}
  const kept: Record<string, unknown> = {}
  for (const k of allowClientKeys) if (k in client) kept[k] = client[k]
  const attr = sanitizeAttribution(body)
  return {
    ...kept,
    form_key: formKey,
    submit_path: publicPath(body.submitPath),
    attribution_version: attr.version,
    first_touch: attr.first_touch,
    latest_touch: attr.latest_touch,
    ...(submissionId ? { submission_id: submissionId } : {}),
  }
}
