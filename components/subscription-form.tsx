"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button, Field, Input, Select, Textarea } from "@/components/ui"
import { saveSubscription } from "@/lib/actions-subscriptions"
import { BILLING_CYCLES, CRITICALITY, SUBSCRIPTION_CATEGORIES, portalMatchesVendor } from "@/lib/subscriptions"
import { CATEGORY_LABEL, CYCLE_LABEL } from "@/components/subscription-labels"

export interface StaffOption {
  id: string
  name: string
}

export interface SubscriptionFormValues {
  id?: string
  service_name: string
  category: string
  vendor: string
  account_reference: string
  service_url: string
  billing_portal_url: string
  billing_cycle: string
  custom_cycle_days: string
  amount: string
  currency: string
  fx_rate_to_aed: string
  vat_rate: string
  amount_includes_vat: boolean
  next_due_date: string
  renewal_type: string
  auto_renew: boolean
  payment_method_label: string
  owner_id: string
  viewer_ids: string[]
  department: string
  criticality: string
  notes: string
  status: string
}

export const EMPTY_SUBSCRIPTION: SubscriptionFormValues = {
  service_name: "",
  category: "hosting",
  vendor: "",
  account_reference: "",
  service_url: "",
  billing_portal_url: "",
  billing_cycle: "monthly",
  custom_cycle_days: "",
  amount: "",
  currency: "AED",
  fx_rate_to_aed: "1",
  vat_rate: "0",
  amount_includes_vat: false,
  next_due_date: "",
  renewal_type: "manual",
  auto_renew: false,
  payment_method_label: "",
  owner_id: "",
  viewer_ids: [],
  department: "",
  criticality: "medium",
  notes: "",
  status: "active",
}

export function SubscriptionForm({
  initial,
  staff,
  canApprove,
  onDone,
}: {
  initial: SubscriptionFormValues
  staff: StaffOption[]
  canApprove: boolean
  onDone?: (id: string) => void
}) {
  const router = useRouter()
  const [v, setV] = React.useState(initial)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, start] = React.useTransition()
  const set = <K extends keyof SubscriptionFormValues>(k: K, val: SubscriptionFormValues[K]) => setV((p) => ({ ...p, [k]: val }))
  const portalMatch = portalMatchesVendor(v.vendor, v.billing_portal_url)

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set("amount_includes_vat", String(v.amount_includes_vat))
    fd.set("auto_renew", String(v.auto_renew))
    start(async () => {
      const res = await saveSubscription(initial.id ?? null, fd)
      if (!res.ok) return setError(res.error)
      router.refresh()
      onDone?.(res.id)
    })
  }

  const id = (k: string) => `sub-${k}`

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <fieldset className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <legend className="sr-only">Service</legend>
        <Field label="Service name" htmlFor={id("name")}>
          <Input id={id("name")} name="service_name" required maxLength={120} value={v.service_name} onChange={(e) => set("service_name", e.target.value)} />
        </Field>
        <Field label="Category" htmlFor={id("category")}>
          <Select id={id("category")} name="category" value={v.category} onChange={(e) => set("category", e.target.value)}>
            {SUBSCRIPTION_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Vendor" htmlFor={id("vendor")}>
          <Input id={id("vendor")} name="vendor" maxLength={120} value={v.vendor} onChange={(e) => set("vendor", e.target.value)} />
        </Field>
        <Field label="Account or workspace reference" htmlFor={id("acct")} hint="Team name, project ID or account email. Never a password.">
          <Input id={id("acct")} name="account_reference" maxLength={200} value={v.account_reference} onChange={(e) => set("account_reference", e.target.value)} />
        </Field>
        <Field label="Service URL" htmlFor={id("surl")}>
          <Input id={id("surl")} name="service_url" type="url" placeholder="https://" value={v.service_url} onChange={(e) => set("service_url", e.target.value)} />
        </Field>
        <Field
          label="Official billing portal"
          htmlFor={id("purl")}
          hint={
            portalMatch === false
              ? "Warning: this address is not on the vendor's official domain. Check it before saving."
              : "Pay Now opens this page only after an approver verifies it."
          }
        >
          <Input
            id={id("purl")}
            name="billing_portal_url"
            type="url"
            placeholder="https://"
            aria-invalid={portalMatch === false}
            value={v.billing_portal_url}
            onChange={(e) => set("billing_portal_url", e.target.value)}
          />
        </Field>
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <legend className="mb-2 text-sm font-semibold text-foreground">Billing</legend>
        <Field label="Cycle" htmlFor={id("cycle")}>
          <Select id={id("cycle")} name="billing_cycle" value={v.billing_cycle} onChange={(e) => set("billing_cycle", e.target.value)}>
            {BILLING_CYCLES.map((c) => (
              <option key={c} value={c}>
                {CYCLE_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        {v.billing_cycle === "custom" ? (
          <Field label="Every (days)" htmlFor={id("days")}>
            <Input id={id("days")} name="custom_cycle_days" type="number" min={1} max={3660} required value={v.custom_cycle_days} onChange={(e) => set("custom_cycle_days", e.target.value)} />
          </Field>
        ) : null}
        <Field label="Amount" htmlFor={id("amount")}>
          <Input id={id("amount")} name="amount" type="number" step="0.01" min={0} required value={v.amount} onChange={(e) => set("amount", e.target.value)} />
        </Field>
        <Field label="Currency" htmlFor={id("cur")}>
          <Input id={id("cur")} name="currency" maxLength={3} required value={v.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
        </Field>
        {v.currency !== "AED" ? (
          <Field label="Rate to AED" htmlFor={id("fx")}>
            <Input id={id("fx")} name="fx_rate_to_aed" type="number" step="0.000001" min={0} required value={v.fx_rate_to_aed} onChange={(e) => set("fx_rate_to_aed", e.target.value)} />
          </Field>
        ) : (
          <input type="hidden" name="fx_rate_to_aed" value="1" />
        )}
        <Field label="VAT %" htmlFor={id("vat")}>
          <Input id={id("vat")} name="vat_rate" type="number" step="0.01" min={0} max={100} value={v.vat_rate} onChange={(e) => set("vat_rate", e.target.value)} />
        </Field>
        <Field label="Next due date" htmlFor={id("due")}>
          <Input id={id("due")} name="next_due_date" type="date" required value={v.next_due_date} onChange={(e) => set("next_due_date", e.target.value)} />
        </Field>
        <Field label="Renewal" htmlFor={id("renew")}>
          <Select id={id("renew")} name="renewal_type" value={v.renewal_type} onChange={(e) => set("renewal_type", e.target.value)}>
            <option value="manual">Manual payment</option>
            <option value="auto">Auto-charged</option>
          </Select>
        </Field>
        <Field label="Payment method" htmlFor={id("pm")} hint="A label only, e.g. Visa ending 4421.">
          <Input id={id("pm")} name="payment_method_label" maxLength={60} value={v.payment_method_label} onChange={(e) => set("payment_method_label", e.target.value)} />
        </Field>
        <div className="col-span-2 flex flex-wrap items-center gap-x-6 gap-y-2 md:col-span-4">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" className="size-4 accent-primary" checked={v.amount_includes_vat} onChange={(e) => set("amount_includes_vat", e.target.checked)} />
            Amount already includes VAT
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" className="size-4 accent-primary" checked={v.auto_renew} onChange={(e) => set("auto_renew", e.target.checked)} />
            Auto-renew is switched on at the provider
          </label>
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold text-foreground">Responsibility</legend>
        <Field label="Owner" htmlFor={id("owner")}>
          <Select id={id("owner")} name="owner_id" value={v.owner_id} onChange={(e) => set("owner_id", e.target.value)}>
            <option value="">Unassigned</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Department" htmlFor={id("dept")}>
          <Input id={id("dept")} name="department" maxLength={60} value={v.department} onChange={(e) => set("department", e.target.value)} />
        </Field>
        <Field label="Criticality" htmlFor={id("crit")}>
          <Select id={id("crit")} name="criticality" value={v.criticality} onChange={(e) => set("criticality", e.target.value)}>
            {CRITICALITY.map((c) => (
              <option key={c} value={c}>
                {c[0].toUpperCase() + c.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Can also view" htmlFor={id("viewers")} hint="Hold Ctrl/Cmd to select several people." className="md:col-span-2">
          <Select
            id={id("viewers")}
            name="viewer_ids"
            multiple
            className="h-28"
            value={v.viewer_ids}
            onChange={(e) => set("viewer_ids", Array.from(e.target.selectedOptions).map((o) => o.value))}
          >
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        {initial.id ? (
          <Field label="Status" htmlFor={id("status")}>
            <Select id={id("status")} name="status" value={v.status} onChange={(e) => set("status", e.target.value)}>
              <option value="active">Active</option>
              {initial.status === "pending_verification" ? <option value="pending_verification">Needs verification</option> : null}
              {initial.status === "paused" ? <option value="paused">Paused</option> : null}
              {initial.status === "cancelled" ? <option value="cancelled">Cancelled</option> : null}
            </Select>
            {initial.status === "pending_verification" && !canApprove ? (
              <p className="text-xs text-muted-foreground">An approver must verify imported records.</p>
            ) : null}
          </Field>
        ) : null}
        <Field label="Notes" htmlFor={id("notes")} className="md:col-span-3" hint="Do not store card numbers, CVV, passwords or API keys here.">
          <Textarea id={id("notes")} name="notes" rows={3} maxLength={2000} value={v.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </fieldset>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : initial.id ? "Save changes" : "Add subscription"}
        </Button>
      </div>
    </form>
  )
}
