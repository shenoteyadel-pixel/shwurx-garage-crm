/**
 * Race-safe "insert once per browser submission id". The pre-select is only a
 * fast path; the durable guarantee is the partial unique index on
 * metadata->>'submission_id'. When two requests race past the pre-select, the
 * loser gets unique_violation (23505) and is answered with the winner's row.
 */

export type InsertResult =
  | { ok: true; id: string }
  | { ok: false; code?: string | null; error?: string | null }

export type SubmitOnceOutcome =
  | { outcome: "received"; id: string }
  | { outcome: "duplicate"; id: string }
  | { outcome: "error"; error: string }

export const UNIQUE_VIOLATION = "23505"

export async function submitOnce(opts: {
  submissionId: string | null
  find: (submissionId: string) => Promise<string | null>
  insert: () => Promise<InsertResult>
}): Promise<SubmitOnceOutcome> {
  const { submissionId, find, insert } = opts
  if (submissionId) {
    const existing = await find(submissionId)
    if (existing) return { outcome: "duplicate", id: existing }
  }
  const res = await insert()
  if (res.ok) return { outcome: "received", id: res.id }
  if (submissionId && res.code === UNIQUE_VIOLATION) {
    const winner = await find(submissionId)
    if (winner) return { outcome: "duplicate", id: winner }
  }
  return { outcome: "error", error: res.error || "not_persisted" }
}
