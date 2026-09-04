"use server"

import { randomBytes } from "crypto"
import { createServiceClient } from "@/lib/supabase/server"
import { requirePermission, logAction } from "@/lib/rbac/context"
import {
  generateActionLink,
  createManagedAuthUser,
  deleteAuthUser,
  getAuthUserState,
  appBaseUrl,
} from "@/lib/account-links"
import { sendEmail, customerWelcomeEmail, customerCheckInEmail } from "@/lib/email"
import type { CredentialLinkResult } from "@/lib/actions-users"
import { revalidatePath } from "next/cache"

export type CustomerAccessResult = {
  portalStatus: "created" | "existing" | "failed"
  emailStatus: "sent" | "failed" | "skipped"
  emailError?: string
  passwordStatus: "pending" | "completed"
  setPasswordLink: string | null
  hasEmail: boolean
}

/**
 * Idempotently ensure a customer has a portal login when their job card is
 * created, then email them the rich check-in message (vehicle, plate, job,
 * portal, tracking, set-password). Returns an honest status object so the UI
 * can show Created/Existing/Failed and Sent/Failed without ever faking success.
 * Never throws — job creation must not be blocked by portal/email issues.
 */
export async function ensureCustomerPortalForJob(input: {
  customerId: string
  jobId: string
  jobNumber: string
  vehicleLabel: string
  plate: string | null
  trackingUrl: string
  portalUrl: string
  forceResend?: boolean
}): Promise<CustomerAccessResult> {
  const fail = (extra?: Partial<CustomerAccessResult>): CustomerAccessResult => ({
    portalStatus: "failed",
    emailStatus: "skipped",
    passwordStatus: "pending",
    setPasswordLink: null,
    hasEmail: false,
    ...extra,
  })
  try {
    const svc = createServiceClient()
    const { data: customer } = await svc
      .from("customers")
      .select("id, full_name, email, mobile")
      .eq("id", input.customerId)
      .maybeSingle()
    if (!customer) return fail()
    if (!customer.email) return fail({ hasEmail: false })

    const email = customer.email.trim().toLowerCase()

    // Reuse an existing linked portal account, else create one.
    const { data: existingProfile } = await svc
      .from("profiles")
      .select("id")
      .eq("customer_id", input.customerId)
      .maybeSingle()

    let userId = existingProfile?.id ?? null
    let portalStatus: CustomerAccessResult["portalStatus"] = existingProfile ? "existing" : "created"

    if (!userId) {
      try {
        const created = await createManagedAuthUser({
          email,
          metadata: { full_name: customer.full_name, must_set_password: true, is_customer: true },
        })
        userId = created.userId
        const { error: pErr } = await svc.from("profiles").upsert(
          {
            id: userId,
            email,
            full_name: customer.full_name || email,
            phone: customer.mobile || null,
            role: "customer",
            is_active: true,
            customer_id: input.customerId,
            must_set_password: true,
            invited_at: new Date().toISOString(),
            invite_status: "invited",
          },
          { onConflict: "id" },
        )
        if (pErr) {
          if (!created.alreadyExisted) await deleteAuthUser(userId).catch(() => {})
          return fail({ hasEmail: true })
        }
      } catch {
        return fail({ hasEmail: true })
      }
    }

    // Determine whether the customer has already set a password.
    const authState = userId ? await getAuthUserState(userId).catch(() => null) : null
    const passwordStatus: CustomerAccessResult["passwordStatus"] = authState?.hasPassword ? "completed" : "pending"

    // Only generate a set-password link when they still need one.
    let setPasswordLink: string | null = null
    if (passwordStatus === "pending") {
      setPasswordLink = await generateActionLink({
        email,
        type: portalStatus === "created" ? "invite" : "recovery",
        redirectPath: "/auth/set-password",
      }).catch(() => null)
    }

    const send = await sendEmail({
      to: email,
      subject: "Your vehicle has been checked in · SHWURX Auto Service Center",
      html: customerCheckInEmail({
        name: customer.full_name ?? "",
        vehicle: input.vehicleLabel,
        plate: input.plate,
        jobNumber: input.jobNumber,
        portalUrl: input.portalUrl,
        trackingUrl: input.trackingUrl,
        setPasswordUrl: setPasswordLink ?? input.portalUrl,
        showSetPassword: !!setPasswordLink,
      }),
      idempotencyKey: input.forceResend ? `job-checkin/${input.jobId}/${Date.now()}` : `job-checkin/${input.jobId}`,
    })

    // Persist email status on the customer's profile for later display.
    if (userId) {
      await svc
        .from("profiles")
        .update({
          invite_status: send.sent ? "invited" : "email_failed",
          invite_sent_at: new Date().toISOString(),
          invite_error: send.error ?? null,
        })
        .eq("id", userId)
    }

    return {
      portalStatus,
      emailStatus: send.sent ? "sent" : "failed",
      emailError: send.error,
      passwordStatus,
      setPasswordLink,
      hasEmail: true,
    }
  } catch (e) {
    console.log("[v0] ensureCustomerPortalForJob failed:", (e as Error).message)
    return fail()
  }
}

/**
 * Provision (or re-invite) a real customer login account for a customer record.
 * - Creates a confirmed auth user with role=customer, linked to the customer via profiles.customer_id
 * - No plain-text password: the customer sets their own via the welcome link
 * - Emails the welcome link automatically and returns it for manual copy / WhatsApp / email share
 * The tokenized magic-link portal remains available as a fallback.
 */
export async function inviteCustomerToPortal(customerId: string): Promise<CredentialLinkResult> {
  const ctx = await requirePermission("customers.edit")
  const svc = createServiceClient()

  const { data: customer, error } = await svc
    .from("customers")
    .select("id, full_name, email, mobile, whatsapp")
    .eq("id", customerId)
    .maybeSingle()
  if (error || !customer) throw new Error("Customer not found.")
  if (!customer.email) throw new Error("Add an email to this customer before inviting them to the portal.")

  const email = customer.email.trim().toLowerCase()

  // Reuse an existing profile already linked to this customer, else create the account.
  const { data: existingProfile } = await svc
    .from("profiles")
    .select("id, customer_id")
    .eq("customer_id", customerId)
    .maybeSingle()

  let userId = existingProfile?.id ?? null
  let alreadyExisted = !!userId

  if (!userId) {
    const created = await createManagedAuthUser({
      email,
      metadata: { full_name: customer.full_name, must_set_password: true, is_customer: true },
    })
    userId = created.userId
    alreadyExisted = created.alreadyExisted

    const { error: pErr } = await svc.from("profiles").upsert(
      {
        id: userId,
        email,
        full_name: customer.full_name || email,
        phone: customer.mobile || null,
        role: "customer",
        is_active: true,
        customer_id: customerId,
        must_set_password: true,
        invited_at: new Date().toISOString(),
        invited_by: ctx.userId,
      },
      { onConflict: "id" },
    )
    if (pErr) {
      if (!alreadyExisted) await deleteAuthUser(userId).catch(() => {})
      throw new Error(pErr.message)
    }
  }

  const link = await generateActionLink({
    email,
    type: alreadyExisted ? "recovery" : "invite",
    redirectPath: "/portal",
  })

  const send = await sendEmail({
    to: email,
    subject: "Track your vehicle with SHWURX Auto Service Center",
    html: customerWelcomeEmail({ name: customer.full_name ?? "", url: link }),
    idempotencyKey: `customer-invite/${userId}`,
  })

  await logAction(ctx, "customer.portal_invite", "customer", customerId, { email, emailSent: send.sent })
  revalidatePath(`/customers/${customerId}`)
  return { ok: true, userId: userId!, email, link, emailSent: send.sent, emailError: send.error }
}

/**
 * Best-effort auto-provisioning of a customer portal account, called when a
 * customer gets their FIRST job card. Never throws — a failure here must not
 * block job creation. Skips silently when the customer has no email or already
 * has a linked portal account. Not permission-guarded because it runs inside an
 * already-authorized job-creation action.
 */
export async function autoProvisionCustomerPortal(customerId: string): Promise<void> {
  try {
    const svc = createServiceClient()
    const { data: customer } = await svc
      .from("customers")
      .select("id, full_name, email, mobile")
      .eq("id", customerId)
      .maybeSingle()
    if (!customer?.email) return

    const { data: existing } = await svc
      .from("profiles")
      .select("id")
      .eq("customer_id", customerId)
      .maybeSingle()
    if (existing) return

    const email = customer.email.trim().toLowerCase()
    const { userId, alreadyExisted } = await createManagedAuthUser({
      email,
      metadata: { full_name: customer.full_name, must_set_password: true, is_customer: true },
    })

    const { error: pErr } = await svc.from("profiles").upsert(
      {
        id: userId,
        email,
        full_name: customer.full_name || email,
        phone: customer.mobile || null,
        role: "customer",
        is_active: true,
        customer_id: customerId,
        must_set_password: true,
        invited_at: new Date().toISOString(),
        invite_status: "invited",
      },
      { onConflict: "id" },
    )
    if (pErr) {
      if (!alreadyExisted) await deleteAuthUser(userId).catch(() => {})
      return
    }

    const link = await generateActionLink({ email, type: "invite", redirectPath: "/portal" })
    await sendEmail({
      to: email,
      subject: "Track your vehicle with SHWURX Auto Service Center",
      html: customerWelcomeEmail({ name: customer.full_name ?? "", url: link }),
      idempotencyKey: `customer-autoinvite/${userId}`,
    })
  } catch (e) {
    console.log("[v0] autoProvisionCustomerPortal skipped:", (e as Error).message)
  }
}

export type JobAccessInfo = {
  hasCustomer: boolean
  email: string | null
  mobile: string | null
  customerName: string
  vehicleLabel: string
  portalStatus: "created" | "none"
  passwordStatus: "pending" | "completed"
  emailStatus: "sent" | "failed" | "unknown"
  trackingUrl: string | null
  portalUrl: string
  // Tracking-link open auditing (from the live token row).
  trackingViews: number
  trackingFirstOpenedAt: string | null
  trackingLastOpenedAt: string | null
}

/**
 * Read the live customer-access state for a job and ensure a tracking link
 * exists, for the Job Card "Customer access" panel. Creates a token if none is
 * live so staff always have a link to share. Never throws.
 */
export async function getJobCustomerAccess(jobId: string): Promise<JobAccessInfo> {
  const base = appBaseUrl()
  const empty: JobAccessInfo = {
    hasCustomer: false,
    email: null,
    mobile: null,
    customerName: "",
    vehicleLabel: "Vehicle",
    portalStatus: "none",
    passwordStatus: "pending",
    emailStatus: "unknown",
    trackingUrl: null,
    portalUrl: `${base}/portal`,
    trackingViews: 0,
    trackingFirstOpenedAt: null,
    trackingLastOpenedAt: null,
  }
  try {
    await requirePermission("customers.view")
    const svc = createServiceClient()
    const { data: job } = await svc
      .from("jobs")
      .select("id, customer_id, vehicle_make, vehicle_model, vehicle_year, created_by")
      .eq("id", jobId)
      .maybeSingle()
    if (!job?.customer_id) return empty

    const { data: customer } = await svc
      .from("customers")
      .select("full_name, email, mobile")
      .eq("id", job.customer_id)
      .maybeSingle()

    const { data: profile } = await svc
      .from("profiles")
      .select("id, invite_status")
      .eq("customer_id", job.customer_id)
      .maybeSingle()

    let passwordStatus: JobAccessInfo["passwordStatus"] = "pending"
    if (profile?.id) {
      const st = await getAuthUserState(profile.id).catch(() => null)
      if (st?.hasPassword) passwordStatus = "completed"
    }

    // Ensure a live tracking token so staff always have a link to share.
    let trackingUrl: string | null = null
    const { data: live } = await svc
      .from("customer_portal_tokens")
      .select("token, expires_at, revoked, open_count, first_opened_at, last_opened_at")
      .eq("customer_id", job.customer_id)
      .eq("revoked", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const liveValid = !!live && !live.revoked && new Date(live.expires_at).getTime() > Date.now()
    let token = liveValid ? live!.token : null
    if (!token) {
      token = randomBytes(24).toString("base64url")
      const { error } = await svc.from("customer_portal_tokens").insert({
        customer_id: job.customer_id,
        token,
        expires_at: new Date(Date.now() + 90 * 86400_000).toISOString(),
        created_by: job.created_by ?? null,
      })
      if (error) token = null
    }
    if (token) trackingUrl = `${base}/track/${token}`

    return {
      hasCustomer: true,
      email: customer?.email ?? null,
      mobile: customer?.mobile ?? null,
      customerName: customer?.full_name ?? "",
      vehicleLabel:
        [job.vehicle_year, job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ") || "Vehicle",
      portalStatus: profile?.id ? "created" : "none",
      passwordStatus,
      emailStatus:
        profile?.invite_status === "invited"
          ? "sent"
          : profile?.invite_status === "email_failed"
            ? "failed"
            : "unknown",
      trackingUrl,
      portalUrl: `${base}/portal`,
      trackingViews: liveValid ? Number(live!.open_count ?? 0) : 0,
      trackingFirstOpenedAt: liveValid ? (live!.first_opened_at ?? null) : null,
      trackingLastOpenedAt: liveValid ? (live!.last_opened_at ?? null) : null,
    }
  } catch (e) {
    console.log("[v0] getJobCustomerAccess failed:", (e as Error).message)
    return empty
  }
}

/**
 * Re-send the check-in email for an existing job (used by the success popup and
 * the Job Card customer-access panel). Rebuilds the customer-facing context from
 * the job + a live tracking token and forces a fresh send (bypasses idempotency).
 */
export async function resendCheckInForJob(jobId: string): Promise<CustomerAccessResult> {
  await requirePermission("jobs.create")
  const svc = createServiceClient()
  const { data: job } = await svc
    .from("jobs")
    .select(
      "id, job_number, customer_id, vehicle_make, vehicle_model, vehicle_year, plate_emirate, plate_code, plate_number",
    )
    .eq("id", jobId)
    .maybeSingle()
  if (!job?.customer_id) {
    return {
      portalStatus: "failed",
      emailStatus: "skipped",
      passwordStatus: "pending",
      setPasswordLink: null,
      hasEmail: false,
    }
  }

  const base = appBaseUrl()
  const { data: live } = await svc
    .from("customer_portal_tokens")
    .select("token, expires_at, revoked")
    .eq("customer_id", job.customer_id)
    .eq("revoked", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const trackingUrl =
    live && !live.revoked && new Date(live.expires_at).getTime() > Date.now()
      ? `${base}/track/${live.token}`
      : `${base}/portal`

  const vehicleLabel =
    [job.vehicle_year, job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ") || "Vehicle"
  const plate = [job.plate_emirate, job.plate_code, job.plate_number].filter(Boolean).join(" ") || null

  return ensureCustomerPortalForJob({
    customerId: job.customer_id,
    jobId: job.id,
    jobNumber: job.job_number ?? "",
    vehicleLabel,
    plate,
    trackingUrl,
    portalUrl: `${base}/portal`,
    forceResend: true,
  })
}

/**
 * Revoke a job customer's existing tracking links and mint a fresh one. Use
 * when a link may have been shared with the wrong person. Returns the new
 * absolute tracking URL, or null when the job has no linked customer.
 */
export async function regenerateJobTrackingLink(jobId: string): Promise<{ trackingUrl: string | null }> {
  const ctx = await requirePermission("customers.edit")
  const svc = createServiceClient()
  const { data: job } = await svc.from("jobs").select("customer_id").eq("id", jobId).maybeSingle()
  if (!job?.customer_id) return { trackingUrl: null }

  // Revoke every currently-active link for this customer.
  await svc
    .from("customer_portal_tokens")
    .update({ revoked: true })
    .eq("customer_id", job.customer_id)
    .eq("revoked", false)

  const token = randomBytes(24).toString("base64url")
  const { error } = await svc.from("customer_portal_tokens").insert({
    customer_id: job.customer_id,
    token,
    // Placeholder deadline; ignored while a job is open, re-stamped on delivery.
    expires_at: new Date(Date.now() + 90 * 86400_000).toISOString(),
    expiry_mode: "while_open",
    created_by: ctx.userId,
  })
  if (error) throw new Error(error.message)

  await logAction(ctx, "portal.regenerate_tracking", "job", jobId)
  revalidatePath(`/jobs/${jobId}`)
  return { trackingUrl: `${appBaseUrl()}/track/${token}` }
}
