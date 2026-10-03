"use client"

import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui"
import { buildStatementPdf, money, pdfDate, type StatementCompany } from "@/components/statement-pdf"

export type HistoryVehicle = { label: string; plate: string; vin: string | null }
export type HistoryJob = { number: string; vehicle: string; plate: string | null; stage: string; date: string | null }
export type HistoryInvoice = { number: string; date: string | null; status: string; total: number; paid: number }
export type HistoryPayment = { date: string | null; invoice: string; method: string | null; reference: string | null; amount: number }

export function CustomerHistoryButton({
  company,
  customer,
  vehicles,
  jobs,
  invoices,
  payments,
}: {
  company: StatementCompany
  customer: { name: string; mobile?: string | null; email?: string | null; company?: string | null; trn?: string | null }
  vehicles: HistoryVehicle[]
  jobs: HistoryJob[]
  invoices: HistoryInvoice[]
  payments: HistoryPayment[]
}) {
  const [busy, setBusy] = useState(false)

  async function download() {
    setBusy(true)
    try {
      const invoiced = invoices.reduce((t, i) => t + i.total, 0)
      const paid = invoices.reduce((t, i) => t + i.paid, 0)
      await buildStatementPdf({
        company,
        title: "Customer History",
        party: {
          name: customer.name,
          lines: [
            [customer.mobile, customer.email].filter(Boolean).join("  ·  "),
            [customer.company, customer.trn ? `TRN ${customer.trn}` : null].filter(Boolean).join("  ·  "),
          ],
        },
        summary: [
          { label: "Visits", value: String(jobs.length) },
          { label: "Invoiced", value: money(invoiced) },
          { label: "Paid", value: money(paid) },
          { label: "Outstanding", value: money(Math.max(0, invoiced - paid)) },
        ],
        sections: [
          {
            title: `Vehicles (${vehicles.length})`,
            cols: [
              { label: "Vehicle", w: 80 },
              { label: "Plate", w: 50 },
              { label: "VIN", w: 56 },
            ],
            rows: vehicles.map((v) => [v.label, v.plate, v.vin ?? "—"]),
            empty: "No vehicles on file.",
          },
          {
            title: `Service history (${jobs.length})`,
            cols: [
              { label: "Date", w: 28 },
              { label: "Job card", w: 32 },
              { label: "Vehicle", w: 64 },
              { label: "Plate", w: 32 },
              { label: "Stage", w: 30 },
            ],
            rows: jobs.map((j) => [pdfDate(j.date), j.number, j.vehicle || "—", j.plate ?? "—", j.stage]),
            empty: "No job cards yet.",
          },
          {
            title: `Invoices (${invoices.length})`,
            cols: [
              { label: "Date", w: 28 },
              { label: "Invoice", w: 36 },
              { label: "Status", w: 26 },
              { label: "Total", w: 32, right: true },
              { label: "Paid", w: 32, right: true },
              { label: "Balance", w: 32, right: true },
            ],
            rows: invoices.map((i) => [
              pdfDate(i.date),
              i.number,
              i.status,
              money(i.total),
              money(i.paid),
              money(Math.max(0, i.total - i.paid)),
            ]),
            empty: "No invoices yet.",
          },
          {
            title: `Payments received (${payments.length})`,
            cols: [
              { label: "Date", w: 28 },
              { label: "Invoice", w: 36 },
              { label: "Method", w: 36 },
              { label: "Reference", w: 54 },
              { label: "Amount", w: 32, right: true },
            ],
            rows: payments.map((p) => [pdfDate(p.date), p.invoice, p.method ?? "—", p.reference ?? "—", money(p.amount)]),
            empty: "No payments recorded.",
          },
        ],
        footerNote: `Generated ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai" })}`,
        fileName: `history-${customer.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={download} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      Download history
    </Button>
  )
}
