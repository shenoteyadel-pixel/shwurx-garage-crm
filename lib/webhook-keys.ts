import { timingSafeEqual } from "node:crypto"

export type KeySlot = "current" | "previous"

export interface WebhookKeyCandidate {
  slot: KeySlot
  value: string
}

export function safeEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Builds the list of accepted keys for a two-key rotation window.
 * `current` falls back to the derived key so behaviour is unchanged when no env key is set.
 */
export function rotationCandidates(
  current: string | null | undefined,
  previous: string | null | undefined,
): WebhookKeyCandidate[] {
  const list: WebhookKeyCandidate[] = []
  const cur = current?.trim()
  const prev = previous?.trim()
  if (cur) list.push({ slot: "current", value: cur })
  if (prev && prev !== cur) list.push({ slot: "previous", value: prev })
  return list
}

/** Returns which slot matched, or null. Checks every candidate so timing does not reveal the slot. */
export function matchWebhookKey(
  provided: string | null | undefined,
  candidates: WebhookKeyCandidate[],
): KeySlot | null {
  if (!provided) return null
  let matched: KeySlot | null = null
  for (const c of candidates) {
    if (safeEqual(provided, c.value) && matched === null) matched = c.slot
  }
  return matched
}
