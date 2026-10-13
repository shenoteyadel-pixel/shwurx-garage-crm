"use client"

import { useState } from "react"
import { Check, Copy, Landmark } from "lucide-react"
import type { PaymentOptions } from "@/lib/actions-invoice-pay"

type Bank = NonNullable<PaymentOptions["bank"]>

export function BankDetails({ bank, reference }: { bank: Bank; reference: string }) {
  const rows: { label: string; value: string | null; mono?: boolean }[] = [
    { label: "Account name", value: bank.accountName },
    { label: "Bank", value: bank.bankName },
    { label: "IBAN", value: bank.iban, mono: true },
    { label: "Account no.", value: bank.accountNumber, mono: true },
    { label: "SWIFT", value: bank.swift, mono: true },
    { label: "Reference", value: reference, mono: true },
  ]

  return (
    <section aria-labelledby="bank-title" className="rounded-xl border border-border bg-card p-5">
      <h2 id="bank-title" className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Landmark className="h-4 w-4 text-primary" aria-hidden="true" />
        Pay by bank transfer
      </h2>
      <dl className="flex flex-col divide-y divide-border">
        {rows
          .filter((r) => r.value)
          .map((r) => (
            <CopyRow key={r.label} label={r.label} value={r.value as string} mono={r.mono} />
          ))}
      </dl>
      {bank.note && <p className="mt-3 text-pretty text-xs leading-relaxed text-muted-foreground">{bank.note}</p>}
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        After you transfer, send us the receipt on WhatsApp and we&apos;ll mark the invoice as paid.
      </p>
    </section>
  )
}

function CopyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — value is still selectable */
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className={`select-all break-all text-sm text-foreground ${mono ? "font-mono" : ""}`}>{value}</dd>
      </div>
      <button
        type="button"
        onClick={copy}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  )
}
