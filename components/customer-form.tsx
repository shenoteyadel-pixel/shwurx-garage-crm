"use client"

import * as React from "react"
import { createCustomer, updateCustomer } from "@/lib/actions-customers"
import { Button, Card, Input, Label, Textarea, Select } from "@/components/ui"

type Customer = {
  id: string
  full_name: string
  mobile: string | null
  alt_mobile: string | null
  whatsapp: string | null
  email: string | null
  company_name: string | null
  trn: string | null
  address: string | null
  notes: string | null
  status: string
}

export function CustomerForm({
  customer,
  redirectTo,
}: {
  customer?: Customer
  redirectTo?: string
}) {
  const [submitting, setSubmitting] = React.useState(false)
  const editing = !!customer

  return (
    <form
      action={async (fd) => {
        setSubmitting(true)
        try {
          if (editing) await updateCustomer(customer!.id, fd)
          else await createCustomer(fd)
        } finally {
          setSubmitting(false)
        }
      }}
      className="space-y-6"
    >
      {redirectTo ? <input type="hidden" name="redirect_to" value={redirectTo} /> : null}

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Contact</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="full_name">Full name</Label>
            <Input id="full_name" name="full_name" required defaultValue={customer?.full_name ?? ""} placeholder="e.g. Ahmed Al Mansoori" />
          </div>
          <div>
            <Label htmlFor="mobile">Mobile</Label>
            <Input id="mobile" name="mobile" inputMode="tel" defaultValue={customer?.mobile ?? ""} placeholder="e.g. +971 50 123 4567" />
          </div>
          <div>
            <Label htmlFor="alt_mobile">Alternate mobile</Label>
            <Input id="alt_mobile" name="alt_mobile" inputMode="tel" defaultValue={customer?.alt_mobile ?? ""} />
          </div>
          <div>
            <Label htmlFor="whatsapp">WhatsApp</Label>
            <Input id="whatsapp" name="whatsapp" inputMode="tel" defaultValue={customer?.whatsapp ?? ""} />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={customer?.email ?? ""} />
          </div>
          {editing ? (
            <div>
              <Label htmlFor="status">Status</Label>
              <Select id="status" name="status" defaultValue={customer?.status ?? "active"}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Company &amp; billing
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="company_name">Company name</Label>
            <Input id="company_name" name="company_name" defaultValue={customer?.company_name ?? ""} placeholder="Optional" />
          </div>
          <div>
            <Label htmlFor="trn">TRN (VAT number)</Label>
            <Input id="trn" name="trn" defaultValue={customer?.trn ?? ""} placeholder="Optional" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Textarea id="address" name="address" defaultValue={customer?.address ?? ""} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={customer?.notes ?? ""} />
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? "Saving..." : editing ? "Save Changes" : "Create Customer"}
        </Button>
      </div>
    </form>
  )
}
