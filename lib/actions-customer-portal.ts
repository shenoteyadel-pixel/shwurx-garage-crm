"use server"

import { createServiceClient } from "@/lib/supabase/server"
import { requirePermission, logAction } from "@/lib/rbac/context"
import { generateActionLink, createManagedAuthUser, deleteAuthUser } from "@/lib/account-links"
import { sendEmail, customerWelcomeEmail } from "@/lib/email"
import type { CredentialLinkResult } from "@/lib/actions-users"
import { revalidatePath } from "next/cache"

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
    subject: "Track your vehicle with Shwurx Garage",
    html: customerWelcomeEmail({ name: customer.full_name ?? "", url: link }),
    idempotencyKey: `customer-invite/${userId}`,
  })

  await logAction(ctx, "customer.portal_invite", "customer", customerId, { email, emailSent: send.sent })
  revalidatePath(`/customers/${customerId}`)
  return { userId: userId!, email, link, emailSent: send.sent, emailError: send.error }
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
      subject: "Track your vehicle with Shwurx Garage",
      html: customerWelcomeEmail({ name: customer.full_name ?? "", url: link }),
      idempotencyKey: `customer-autoinvite/${userId}`,
    })
  } catch (e) {
    console.log("[v0] autoProvisionCustomerPortal skipped:", (e as Error).message)
  }
}
