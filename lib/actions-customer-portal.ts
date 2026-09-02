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
  return { email, link, emailSent: send.sent, emailError: send.error }
}
