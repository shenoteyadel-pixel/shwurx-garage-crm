import { cookies, headers } from "next/headers"
import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
} from "@simplewebauthn/server"
import { createServiceClient } from "@/lib/supabase/server"

const CHALLENGE_COOKIE = "att_faceid_challenge"

export async function relyingParty() {
  const h = await headers()
  const origin = h.get("origin") ?? `https://${h.get("x-forwarded-host") ?? h.get("host")}`
  return { origin, rpID: new URL(origin).hostname }
}

export async function storeChallenge(userId: string, challenge: string) {
  const jar = await cookies()
  jar.set(CHALLENGE_COOKIE, `${userId}.${challenge}`, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: 300,
  })
}

export async function takeChallenge(userId: string): Promise<string | null> {
  const jar = await cookies()
  const raw = jar.get(CHALLENGE_COOKIE)?.value
  jar.delete(CHALLENGE_COOKIE)
  if (!raw) return null
  const [owner, challenge] = raw.split(".")
  return owner === userId && challenge ? challenge : null
}

export async function loadPasskeys(userId: string) {
  const svc = createServiceClient()
  const { data } = await svc
    .from("attendance_passkeys")
    .select("id, credential_id, public_key, counter, transports, device_label, created_at")
    .eq("user_id", userId)
  return data ?? []
}

export function toTransports(t: string[] | null) {
  return (t ?? undefined) as AuthenticatorTransportFuture[] | undefined
}

/**
 * Verifies a Face ID / fingerprint assertion for the user.
 * Returns `null` when the user has no enrolled device (Face ID not required),
 * `"face_id"` when verified, or an error string.
 */
export async function verifyFaceIdForAttendance(
  userId: string,
  assertion: AuthenticationResponseJSON | null | undefined,
): Promise<{ verified: "face_id" | null } | { error: string }> {
  const keys = await loadPasskeys(userId)
  if (keys.length === 0) return { verified: null }
  if (!assertion) return { error: "Face ID is required for this account. Confirm with Face ID and try again." }

  const key = keys.find((k) => k.credential_id === assertion.id)
  if (!key) return { error: "This device is not registered for your Face ID." }

  const expectedChallenge = await takeChallenge(userId)
  if (!expectedChallenge) return { error: "Face ID check expired. Please try again." }

  const { origin, rpID } = await relyingParty()
  try {
    const { verified, authenticationInfo } = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: key.credential_id,
        publicKey: new Uint8Array(Buffer.from(key.public_key, "base64url")),
        counter: Number(key.counter),
        transports: toTransports(key.transports),
      },
    })
    if (!verified) return { error: "Face ID did not match." }
    const svc = createServiceClient()
    await svc
      .from("attendance_passkeys")
      .update({ counter: authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
      .eq("id", key.id)
    return { verified: "face_id" }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Face ID verification failed." }
  }
}
