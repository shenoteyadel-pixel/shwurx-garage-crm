"use server"

import { revalidatePath } from "next/cache"
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server"
import { createServiceClient } from "@/lib/supabase/server"
import { logAction, requireStaff } from "@/lib/rbac/context"
import { loadPasskeys, relyingParty, storeChallenge, takeChallenge, toTransports } from "@/lib/faceid"

const RP_NAME = "SHWURX Garage"

type Fail = { ok: false; error: string }

export async function startFaceIdEnrollment(): Promise<{ ok: true; options: PublicKeyCredentialCreationOptionsJSON } | Fail> {
  const ctx = await requireStaff()
  const { rpID } = await relyingParty()
  const existing = await loadPasskeys(ctx.userId)
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: ctx.email ?? ctx.name,
    userDisplayName: ctx.name,
    attestationType: "none",
    excludeCredentials: existing.map((k) => ({ id: k.credential_id, transports: toTransports(k.transports) })),
    authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "required" },
  })
  await storeChallenge(ctx.userId, options.challenge)
  return { ok: true, options }
}

export async function finishFaceIdEnrollment(
  response: RegistrationResponseJSON,
  deviceLabel?: string,
): Promise<{ ok: true } | Fail> {
  const ctx = await requireStaff()
  const expectedChallenge = await takeChallenge(ctx.userId)
  if (!expectedChallenge) return { ok: false, error: "Setup expired. Please try again." }
  const { origin, rpID } = await relyingParty()

  try {
    const { verified, registrationInfo } = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    })
    if (!verified || !registrationInfo) return { ok: false, error: "Face ID could not be verified." }

    const { credential } = registrationInfo
    const svc = createServiceClient()
    const { error } = await svc.from("attendance_passkeys").insert({
      user_id: ctx.userId,
      credential_id: credential.id,
      public_key: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: credential.transports ?? null,
      device_label: deviceLabel?.slice(0, 80) || null,
    })
    if (error) return { ok: false, error: error.message }
    await logAction(ctx, "attendance.faceid_enrolled", "profile", ctx.userId, { device: deviceLabel ?? null })
    revalidatePath("/attendance")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Face ID setup failed." }
  }
}

export async function removeFaceIdDevice(id: string): Promise<{ ok: true } | Fail> {
  const ctx = await requireStaff()
  const svc = createServiceClient()
  const { error } = await svc.from("attendance_passkeys").delete().eq("id", id).eq("user_id", ctx.userId)
  if (error) return { ok: false, error: error.message }
  await logAction(ctx, "attendance.faceid_removed", "profile", ctx.userId, { passkey_id: id })
  revalidatePath("/attendance")
  return { ok: true }
}

export async function startFaceIdCheck(): Promise<{ ok: true; options: PublicKeyCredentialRequestOptionsJSON } | Fail> {
  const ctx = await requireStaff()
  const keys = await loadPasskeys(ctx.userId)
  if (keys.length === 0) return { ok: false, error: "Face ID is not set up on this account." }
  const { rpID } = await relyingParty()
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: keys.map((k) => ({ id: k.credential_id, transports: toTransports(k.transports) })),
  })
  await storeChallenge(ctx.userId, options.challenge)
  return { ok: true, options }
}
