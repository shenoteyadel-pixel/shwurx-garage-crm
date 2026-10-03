"use client"

import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { Button, Input } from "@/components/ui"
import { buildStatementPdf, money, pdfDate, type StatementCompany } from "@/components/statement-pdf"
import type { AccountInvoice, AccountPayment } from "@/components/supplier-account-client"

type Entry = { date: string; ref: string; detail: string; debit: number; credit: number }

function dayKey(v: string | null | undefined) {
  return v ? v.slice(0, 10) : ""
}

export function SupplierStatementButton({
  company,
  supplier,
  invoices,
  payments,
  opening,
}: {
  company: StatementCompany
  supplier: { name: string; contact_person?: string | null; mobile?: string | null; email?: string | null; trn?: string | null; credit_terms?: string | null }
  invoices: AccountInvoice[]
  payments: AccountPayment[]
  opening: number
}) {
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [busy, setBusy] = useState(false)

  async function download() {
    setBusy(true)
    try {
      const entries: Entry[] = [
        ...invoices
          .filter((i) => i.status === "confirmed")
          .map((i) => ({
            date: dayKey(i.invoice_date),
            ref: i.doc_number || i.invoice_number || "Bill",
            detail: `Bill${i.invoice_number ? ` · Inv ${i.invoice_number}` : ""}`,
            debit: i.total,
            credit: 0,
          })),
        ...payments.map((p) => ({
          date: dayKey(p.paid_at || p.created_at),
          ref: p.reference || "Payment",
          detail: `Payment${p.method ? ` (${p.method})` : ""}${p.invoice_label ? ` · ${p.invoice_label}` : ""}`,
          debit: 0,
          credit: p.amount,
        })),
      ].sort((a, b) => a.date.localeCompare(b.date) || b.debit - a.debit)

      let broughtForward = opening
      const inRange: Entry[] = []
      for (const e of entries) {
        if (from && e.date && e.date < from) broughtForward += e.debit - e.credit
        else if (!to || !e.date || e.date <= to) inRange.push(e)
      }

      let balance = broughtForward
      const rows = [
        ["", "", from ? "Balance brought forward" : "Opening balance", "", "", money(broughtForward)],
        ...inRange.map((e) => {
          balance += e.debit - e.credit
          return [
            pdfDate(e.date),
            e.ref,
            e.detail,
            e.debit ? money(e.debit) : "",
            e.credit ? money(e.credit) : "",
            money(balance),
          ]
        }),
      ]
      const billed = inRange.reduce((t, e) => t + e.debit, 0)
      const paid = inRange.reduce((t, e) => t + e.credit, 0)
      const period = from || to ? `Period ${from ? pdfDate(from) : "start"} – ${to ? pdfDate(to) : "today"}` : "All transactions"

      await buildStatementPdf({
        company,
        title: "Supplier Statement",
        subtitle: period,
        party: {
          name: supplier.name,
          lines: [
            [supplier.contact_person, supplier.mobile, supplier.email].filter(Boolean).join("  ·  "),
            [supplier.trn ? `TRN ${supplier.trn}` : null, supplier.credit_terms ? `Terms: ${supplier.credit_terms}` : null]
              .filter(Boolean)
              .join("  ·  "),
          ],
        },
        summary: [
          { label: from ? "Brought forward" : "Opening", value: money(broughtForward) },
          { label: "Billed", value: money(billed) },
          { label: "Paid", value: money(paid) },
          { label: "Balance due", value: money(balance) },
        ],
        sections: [
          {
            title: "Account ledger",
            cols: [
              { label: "Date", w: 24 },
              { label: "Reference", w: 30 },
              { label: "Details", w: 56 },
              { label: "Billed", w: 26, right: true },
              { label: "Paid", w: 26, right: true },
              { label: "Balance", w: 24, right: true },
            ],
            rows,
          },
        ],
        footerNote: `Generated ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai" })} · Confirmed bills only`,
        fileName: `statement-${supplier.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}${from ? `-${from}` : ""}${to ? `-to-${to}` : ""}.pdf`,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        From
        <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        To
        <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
      </label>
      <Button size="sm" onClick={download} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Download statement
      </Button>
    </div>
  )
}
