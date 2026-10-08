"use client"

import { useEffect, useRef, useState } from "react"
import { FileDown, Loader2 } from "lucide-react"
import type { VatReport, VatBox } from "@/lib/vat-report"

type Company = { name: string; trn: string | null; address: string | null }

const GREEN: [number, number, number] = [95, 214, 34]
const INK: [number, number, number] = [23, 23, 23]
const GREY: [number, number, number] = [110, 110, 110]
const LINE: [number, number, number] = [215, 215, 215]
const n2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function loadImage(src: string): Promise<{ data: string; w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      try {
        const c = document.createElement("canvas")
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        c.getContext("2d")!.drawImage(img, 0, 0)
        resolve({ data: c.toDataURL("image/png"), w: img.naturalWidth, h: img.naturalHeight })
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

export async function buildVatPdf(report: VatReport, company: Company) {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 14
  const logo = await loadImage("/brand/shwurx-logo-ink.png")

  const watermark = () => {
    if (!logo) return
    const gs = new (doc as any).GState({ opacity: 0.06 })
    doc.setGState(gs)
    const ww = 150
    const wh = (logo.h / logo.w) * ww
    doc.addImage(logo.data, "PNG", (W - ww) / 2, (H - wh) / 2, ww, wh)
    doc.setGState(new (doc as any).GState({ opacity: 1 }))
  }

  const header = () => {
    watermark()
    doc.setFillColor(...GREEN)
    doc.rect(0, 0, W, 2, "F")
    if (logo) {
      const lw = 38
      doc.addImage(logo.data, "PNG", M, 7, lw, (logo.h / logo.w) * lw)
    }
    doc.setTextColor(...INK)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(14)
    doc.text("VAT Return (VAT 201)", W - M, 12, { align: "right" })
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8.5)
    doc.setTextColor(...GREY)
    doc.text("Federal Tax Authority - United Arab Emirates", W - M, 17, { align: "right" })
    doc.text(`Tax period: ${report.from} to ${report.to}`, W - M, 21.5, { align: "right" })
    doc.setDrawColor(...LINE)
    doc.line(M, 28, W - M, 28)
  }

  let y = 0
  const newPage = () => {
    doc.addPage()
    header()
    y = 34
  }
  const ensure = (h: number) => {
    if (y + h > H - 16) newPage()
  }

  header()
  y = 34

  // Taxable person block
  doc.setFontSize(9)
  const info: [string, string][] = [
    ["Taxable person", company.name],
    ["TRN", company.trn || "Not set"],
    ["Address", company.address || "Dubai, UAE"],
    ["Currency", "AED"],
  ]
  for (const [k, v] of info) {
    doc.setTextColor(...GREY)
    doc.text(k, M, y)
    doc.setTextColor(...INK)
    doc.text(doc.splitTextToSize(v, W - M * 2 - 40), M + 40, y)
    y += 5
  }
  y += 3

  const table = (title: string, cols: { label: string; w: number; right?: boolean }[], rows: string[][], boldLast = false) => {
    ensure(18)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.setTextColor(...INK)
    doc.text(title, M, y)
    y += 3
    doc.setFillColor(240, 240, 240)
    doc.rect(M, y, W - M * 2, 6.5, "F")
    doc.setFontSize(7.5)
    doc.setTextColor(...GREY)
    let x = M
    for (const c of cols) {
      doc.text(c.label, c.right ? x + c.w - 1.5 : x + 1.5, y + 4.4, { align: c.right ? "right" : "left" })
      x += c.w
    }
    y += 6.5
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    rows.forEach((r, i) => {
      const last = boldLast && i === rows.length - 1
      const lines = r.map((cell, ci) => doc.splitTextToSize(cell, cols[ci].w - 3) as string[])
      const h = Math.max(...lines.map((l) => l.length)) * 3.6 + 2.4
      ensure(h)
      doc.setFont("helvetica", last ? "bold" : "normal")
      doc.setTextColor(...INK)
      x = M
      lines.forEach((l, ci) => {
        const c = cols[ci]
        doc.text(l, c.right ? x + c.w - 1.5 : x + 1.5, y + 3.6, { align: c.right ? "right" : "left" })
        x += c.w
      })
      y += h
      doc.setDrawColor(...LINE)
      doc.line(M, y, W - M, y)
    })
    y += 6
  }

  const boxCols = [
    { label: "Box", w: 12 },
    { label: "Description", w: 88 },
    { label: "Amount (AED)", w: 30, right: true },
    { label: "VAT (AED)", w: 26, right: true },
    { label: "Adj. (AED)", w: 26, right: true },
  ]
  const boxRow = (b: VatBox) => [b.box, b.label, n2(b.amount), n2(b.vat), b.adjustment === undefined ? "" : n2(b.adjustment)]

  table(
    "VAT on sales and all other outputs",
    boxCols,
    [...report.outputBoxes.map(boxRow), ["8", "Totals", n2(report.box8.amount), n2(report.box8.vat), ""]],
    true,
  )
  table(
    "VAT on expenses and all other inputs",
    boxCols,
    [...report.inputBoxes.map(boxRow), ["11", "Totals", n2(report.box11.amount), n2(report.box11.vat), ""]],
    true,
  )

  // Net VAT due
  ensure(30)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text("Net VAT due", M, y)
  y += 3
  const net: [string, string, number][] = [
    ["12", "Total value of due tax for the period", report.box12],
    ["13", "Total value of recoverable tax for the period", report.box13],
    ["14", report.box14 >= 0 ? "Payable tax for the period" : "Refundable tax for the period", report.box14],
  ]
  net.forEach(([box, label, v], i) => {
    const strong = i === 2
    if (strong) {
      doc.setFillColor(...GREEN)
      doc.rect(M, y, W - M * 2, 8, "F")
    }
    doc.setFont("helvetica", strong ? "bold" : "normal")
    doc.setFontSize(strong ? 10 : 8.5)
    doc.setTextColor(...INK)
    doc.text(box, M + 1.5, y + 5.3)
    doc.text(label, M + 13.5, y + 5.3)
    doc.text(`AED ${n2(strong ? Math.abs(v) : v)}`, W - M - 1.5, y + 5.3, { align: "right" })
    y += 8
    if (!strong) {
      doc.setDrawColor(...LINE)
      doc.line(M, y, W - M, y)
    }
  })
  y += 8

  table(
    `Sales tax invoices (${report.sales.length})`,
    [
      { label: "Invoice", w: 26 },
      { label: "Date", w: 20 },
      { label: "Customer", w: 46 },
      { label: "Customer TRN", w: 30 },
      { label: "Net", w: 20, right: true },
      { label: "VAT", w: 18, right: true },
      { label: "Total", w: 22, right: true },
    ],
    report.sales.length
      ? report.sales.map((s) => [s.number, s.date, s.customer, s.customerTrn || "-", n2(s.net), n2(s.vat), n2(s.total)])
      : [["-", "", "No sales invoices in this period", "", "", "", ""]],
  )
  table(
    `Purchase tax invoices (${report.purchases.length})`,
    [
      { label: "Invoice", w: 24 },
      { label: "Date", w: 20 },
      { label: "Supplier", w: 44 },
      { label: "Supplier TRN", w: 30 },
      { label: "Net", w: 20, right: true },
      { label: "VAT", w: 18, right: true },
      { label: "Recoverable", w: 26, right: true },
    ],
    report.purchases.length
      ? report.purchases.map((p) => [
          p.number,
          p.date,
          p.supplier,
          p.supplierTrn || "-",
          n2(p.net),
          n2(p.vat),
          p.recoverable ? "Yes" : "No (no valid TRN)",
        ])
      : [["-", "", "No confirmed purchase invoices", "", "", "", ""]],
  )

  ensure(24)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(...GREY)
  const note = doc.splitTextToSize(
    "Prepared under Federal Decree-Law No. 8 of 2017 on Value Added Tax and its Executive Regulation. Sales are standard rated at 5% with Dubai as the place of supply. Input tax is only recovered against tax invoices carrying a valid 15-digit supplier TRN. Review before filing on EmaraTax. Keep tax records for at least 5 years.",
    W - M * 2,
  )
  doc.text(note, M, y)

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5)
    doc.setTextColor(...GREY)
    doc.text(`${company.name} · TRN ${company.trn || "-"} · Generated ${new Date().toLocaleString("en-GB")}`, M, H - 8)
    doc.text(`Page ${i} of ${pages}`, W - M, H - 8, { align: "right" })
  }

  doc.save(`VAT201-${report.from}-to-${report.to}.pdf`)
}

export function VatPdfButton({
  report,
  company,
  autoStart = false,
  className,
}: {
  report: VatReport
  company: Company
  autoStart?: boolean
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      await buildVatPdf(report, company)
    } catch (e) {
      setError((e as Error).message || "Could not create the PDF")
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true
      run()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart])

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={
          className ??
          "inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        }
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileDown className="h-4 w-4" aria-hidden />}
        {busy ? "Creating PDF…" : "Download PDF"}
      </button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  )
}
