"use client"

import type { FinanceReport } from "@/lib/finance"

type Company = { name: string; trn: string | null; address: string | null }
type Col = { label: string; w: number; right?: boolean }

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

/** Scales column widths so every table fills the printable width exactly. */
function fit(cols: Col[], width: number): Col[] {
  const total = cols.reduce((s, c) => s + c.w, 0)
  return cols.map((c) => ({ ...c, w: (c.w / total) * width }))
}

export async function buildFinanceAuditPdf(report: FinanceReport, company: Company) {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 12
  const CW = W - M * 2
  const logo = await loadImage("/brand/wurx-logo.png")

  const header = () => {
    if (logo) {
      doc.setGState(new (doc as any).GState({ opacity: 0.05 }))
      const ww = 140
      const wh = (logo.h / logo.w) * ww
      doc.addImage(logo.data, "PNG", (W - ww) / 2, (H - wh) / 2, ww, wh)
      doc.setGState(new (doc as any).GState({ opacity: 1 }))
    }
    doc.setFillColor(...GREEN)
    doc.rect(0, 0, W, 2, "F")
    if (logo) doc.addImage(logo.data, "PNG", M, 6, 34, (logo.h / logo.w) * 34)
    doc.setTextColor(...INK)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(13)
    doc.text("Financial Audit Report", W - M, 11, { align: "right" })
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8.5)
    doc.setTextColor(...GREY)
    doc.text(`${company.name} · TRN ${company.trn || "not set"}`, W - M, 15.5, { align: "right" })
    doc.text(`Period: ${report.from} to ${report.to} · Currency: AED`, W - M, 20, { align: "right" })
    doc.setDrawColor(...LINE)
    doc.line(M, 25, W - M, 25)
  }

  let y = 31
  const newPage = () => {
    doc.addPage()
    header()
    y = 31
  }
  const ensure = (h: number) => {
    if (y + h > H - 14) newPage()
  }

  const heading = (text: string, sub?: string) => {
    ensure(22)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.setTextColor(...INK)
    doc.text(text, M, y)
    if (sub) {
      const offset = doc.getTextWidth(text) + 4
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8)
      doc.setTextColor(...GREY)
      doc.text(sub, M + offset, y)
    }
    y += 3
  }

  const table = (rawCols: Col[], rows: string[][], opts: { boldLast?: boolean; empty?: string } = {}) => {
    const cols = fit(rawCols, CW)
    const head = () => {
      doc.setFillColor(238, 238, 238)
      doc.rect(M, y, CW, 6.5, "F")
      doc.setFont("helvetica", "bold")
      doc.setFontSize(7.5)
      doc.setTextColor(...GREY)
      let x = M
      for (const c of cols) {
        doc.text(c.label, c.right ? x + c.w - 1.5 : x + 1.5, y + 4.4, { align: c.right ? "right" : "left" })
        x += c.w
      }
      y += 6.5
    }
    ensure(14)
    head()
    const body = rows.length ? rows : [[opts.empty ?? "No records in this period", ...cols.slice(1).map(() => "")]]
    body.forEach((r, i) => {
      const bold = opts.boldLast && i === body.length - 1
      doc.setFont("helvetica", bold ? "bold" : "normal")
      doc.setFontSize(7.5)
      const lines = r.map((cell, ci) => doc.splitTextToSize(String(cell ?? ""), cols[ci].w - 3) as string[])
      const h = Math.max(1, ...lines.map((l) => l.length)) * 3.3 + 2.2
      if (y + h > H - 14) {
        newPage()
        head()
        doc.setFont("helvetica", bold ? "bold" : "normal")
        doc.setFontSize(7.5)
      }
      doc.setTextColor(...INK)
      let x = M
      lines.forEach((l, ci) => {
        const c = cols[ci]
        doc.text(l, c.right ? x + c.w - 1.5 : x + 1.5, y + 3.4, { align: c.right ? "right" : "left" })
        x += c.w
      })
      y += h
      doc.setDrawColor(...LINE)
      doc.line(M, y, W - M, y)
    })
    y += 7
  }

  header()

  // Cover summary
  doc.setFontSize(8.5)
  const info: [string, string][] = [
    ["Business", company.name],
    ["TRN", company.trn || "Not set"],
    ["Address", company.address || "Dubai, UAE"],
    ["Generated", new Date(report.generatedAt).toLocaleString("en-GB")],
  ]
  for (const [k, v] of info) {
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...GREY)
    doc.text(k, M, y)
    doc.setTextColor(...INK)
    doc.text(v, M + 28, y)
    y += 4.6
  }
  y += 4

  const p = report.pnl
  heading("1. Profit & loss statement")
  table(
    [{ label: "Line", w: 160 }, { label: "Amount (AED)", w: 50, right: true }],
    [
      ["Parts revenue", n2(p.partsRevenue)],
      ["Labour revenue", n2(p.labourRevenue)],
      ["Less: discounts given", `(${n2(p.discount)})`],
      ["Net sales (excl. VAT)", n2(p.salesNet)],
      ["Less: purchases (excl. VAT)", `(${n2(p.purchasesNet)})`],
      ["Gross profit", n2(p.grossProfit)],
      ["Less: car expenses", `(${n2(p.expenses)})`],
      [`Net profit (${p.margin.toFixed(1)}% margin)`, n2(p.netProfit)],
    ],
    { boldLast: true },
  )

  heading("2. Cash flow")
  table(
    [{ label: "Method", w: 90 }, { label: "Money in (AED)", w: 60, right: true }, { label: "Money out (AED)", w: 60, right: true }, { label: "Net (AED)", w: 60, right: true }],
    [
      ...report.cash.byMethod.map((m) => [m.method, n2(m.moneyIn), n2(m.moneyOut), n2(m.moneyIn - m.moneyOut)]),
      ["Total", n2(report.cash.moneyIn), n2(report.cash.moneyOut), n2(report.cash.net)],
    ],
    { boldLast: true },
  )

  heading("3. VAT summary (FTA VAT 201)")
  table(
    [{ label: "Item", w: 160 }, { label: "Amount (AED)", w: 50, right: true }],
    [
      ["Box 12 - Output VAT due on sales", n2(report.vat.output)],
      ["Box 13 - Recoverable input VAT", n2(report.vat.input)],
      ["Input VAT not recoverable (no valid supplier TRN)", n2(report.vat.blocked)],
      [report.vat.net >= 0 ? "Box 14 - VAT payable" : "Box 14 - VAT refundable", n2(Math.abs(report.vat.net))],
    ],
    { boldLast: true },
  )

  const agingTable = (title: string, data: FinanceReport["receivables"], party: string) => {
    heading(title, `Outstanding as of ${report.to}: AED ${n2(data.total)}`)
    table(
      data.buckets.map((b) => ({ label: b.label, w: 60, right: true })),
      [data.buckets.map((b) => n2(b.amount))],
    )
    table(
      [
        { label: "Document", w: 30 },
        { label: party, w: 70 },
        { label: "Date", w: 24 },
        { label: "Total", w: 28, right: true },
        { label: "Paid", w: 28, right: true },
        { label: "Balance", w: 28, right: true },
        { label: "Days", w: 16, right: true },
        { label: "Bucket", w: 30 },
      ],
      data.rows.map((r) => [r.ref, r.party, r.date, n2(r.total), n2(r.paid), n2(r.balance), String(r.days), r.bucket]),
      { empty: "Nothing outstanding" },
    )
  }
  agingTable("4. Accounts receivable (customers owe)", report.receivables, "Customer")
  agingTable("5. Accounts payable (owed to suppliers)", report.payables, "Supplier")

  const s = report.sales
  heading("6. Sales invoice register", `${s.length} invoices`)
  table(
    [
      { label: "Invoice", w: 26 },
      { label: "Date", w: 22 },
      { label: "Customer", w: 60 },
      { label: "Plate", w: 24 },
      { label: "Net", w: 26, right: true },
      { label: "VAT", w: 22, right: true },
      { label: "Total", w: 26, right: true },
      { label: "Paid", w: 26, right: true },
      { label: "Balance", w: 26, right: true },
      { label: "Status", w: 20 },
    ],
    [
      ...s.map((r) => [r.number, r.date, r.customer, r.plate, n2(r.net), n2(r.vat), n2(r.total), n2(r.paid), n2(r.balance), r.status]),
      ...(s.length
        ? [["Total", "", "", "", n2(p.salesNet), n2(s.reduce((a, r) => a + r.vat, 0)), n2(s.reduce((a, r) => a + r.total, 0)), n2(s.reduce((a, r) => a + r.paid, 0)), n2(s.reduce((a, r) => a + r.balance, 0)), ""]]
        : []),
    ],
    { boldLast: s.length > 0 },
  )

  const pu = report.purchases
  heading("7. Purchase invoice register", `${pu.length} invoices`)
  table(
    [
      { label: "Invoice", w: 28 },
      { label: "Date", w: 22 },
      { label: "Supplier", w: 70 },
      { label: "Net", w: 26, right: true },
      { label: "VAT", w: 22, right: true },
      { label: "Total", w: 26, right: true },
      { label: "Paid", w: 26, right: true },
      { label: "Balance", w: 26, right: true },
      { label: "Status", w: 22 },
    ],
    [
      ...pu.map((r) => [r.number, r.date, r.supplier, n2(r.net), n2(r.vat), n2(r.total), n2(r.paid), n2(r.balance), r.status]),
      ...(pu.length
        ? [["Total", "", "", n2(p.purchasesNet), n2(pu.reduce((a, r) => a + r.vat, 0)), n2(pu.reduce((a, r) => a + r.total, 0)), n2(pu.reduce((a, r) => a + r.paid, 0)), n2(pu.reduce((a, r) => a + r.balance, 0)), ""]]
        : []),
    ],
    { boldLast: pu.length > 0 },
  )

  heading("8. Payments register", `${report.payments.length} payments`)
  table(
    [
      { label: "Date", w: 22 },
      { label: "Direction", w: 20 },
      { label: "Method", w: 20 },
      { label: "Against", w: 28 },
      { label: "Party", w: 60 },
      { label: "Reference", w: 50 },
      { label: "Proof", w: 16 },
      { label: "Amount (AED)", w: 28, right: true },
    ],
    report.payments.map((r) => [r.date, r.direction === "in" ? "Received" : "Paid out", r.method, r.against || "-", r.party || "-", r.reference || "-", r.hasReceipt ? "Yes" : "-", n2(r.amount)]),
  )

  heading("9. Car expenses", `${report.expenses.length} entries`)
  table(
    [
      { label: "Date", w: 22 },
      { label: "Category", w: 26 },
      { label: "Vendor", w: 50 },
      { label: "Description", w: 90 },
      { label: "Tax invoice", w: 20 },
      { label: "Reference", w: 30 },
      { label: "Amount (AED)", w: 28, right: true },
    ],
    report.expenses.map((e) => [e.date, e.category, e.vendor || "-", e.description || "-", e.hasInvoice ? "Yes" : "No", e.reference || "-", n2(e.amount)]),
  )

  heading("10. System audit trail", `${report.audit.length} recorded actions`)
  table(
    [
      { label: "Date & time", w: 32 },
      { label: "User", w: 36 },
      { label: "Role", w: 20 },
      { label: "Action", w: 44 },
      { label: "Record", w: 34 },
      { label: "Result", w: 14 },
      { label: "Details", w: 90 },
    ],
    report.audit.map((a) => [new Date(a.at).toLocaleString("en-GB"), a.actor, a.role, a.action, a.resource, a.status, a.detail]),
    { empty: "No actions recorded in this period" },
  )

  ensure(24)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(...GREY)
  doc.text(
    doc.splitTextToSize(
      "Prepared from the SHWURX CRM records for the period shown. Revenue and purchases are shown excluding VAT; cash flow reflects payments actually recorded. Under UAE Federal Decree-Law No. 8 of 2017 (VAT) and Federal Decree-Law No. 47 of 2022 (Corporate Tax), accounting records and supporting documents must be kept for at least 5 and 7 years respectively. This report supports, but does not replace, an audit by a licensed auditor.",
      CW,
    ),
    M,
    y,
  )
  y += 16
  ensure(20)
  doc.setTextColor(...INK)
  doc.line(M, y + 8, M + 70, y + 8)
  doc.line(W - M - 70, y + 8, W - M, y + 8)
  doc.text("Prepared by", M, y + 12)
  doc.text("Approved by", W - M - 70, y + 12)

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5)
    doc.setTextColor(...GREY)
    doc.text(`${company.name} · Financial Audit Report ${report.from} to ${report.to}`, M, H - 7)
    doc.text(`Page ${i} of ${pages}`, W - M, H - 7, { align: "right" })
  }

  doc.save(`Audit-Report-${report.from}-to-${report.to}.pdf`)
}

function csvEscape(c: unknown) {
  return `"${String(c ?? "").replace(/"/g, '""')}"`
}

export function downloadFinanceCsv(report: FinanceReport, company: Company) {
  const p = report.pnl
  const rows: unknown[][] = [
    ["Financial Audit Report"],
    ["Business", company.name],
    ["TRN", company.trn ?? ""],
    ["Period", `${report.from} to ${report.to}`],
    ["Currency", "AED"],
    [],
    ["PROFIT & LOSS"],
    ["Parts revenue", p.partsRevenue],
    ["Labour revenue", p.labourRevenue],
    ["Discounts", -p.discount],
    ["Net sales (excl. VAT)", p.salesNet],
    ["Purchases (excl. VAT)", -p.purchasesNet],
    ["Gross profit", p.grossProfit],
    ["Car expenses", -p.expenses],
    ["Net profit", p.netProfit],
    ["Net margin %", p.margin],
    [],
    ["CASH FLOW"],
    ["Method", "Money in", "Money out", "Net"],
    ...report.cash.byMethod.map((m) => [m.method, m.moneyIn, m.moneyOut, m.moneyIn - m.moneyOut]),
    ["Total", report.cash.moneyIn, report.cash.moneyOut, report.cash.net],
    [],
    ["VAT SUMMARY"],
    ["Output VAT (Box 12)", report.vat.output],
    ["Recoverable input VAT (Box 13)", report.vat.input],
    ["Non-recoverable input VAT", report.vat.blocked],
    ["Net VAT (Box 14)", report.vat.net],
    [],
    ["ACCOUNTS RECEIVABLE"],
    ["Invoice", "Customer", "Date", "Total", "Paid", "Balance", "Days", "Bucket"],
    ...report.receivables.rows.map((r) => [r.ref, r.party, r.date, r.total, r.paid, r.balance, r.days, r.bucket]),
    [],
    ["ACCOUNTS PAYABLE"],
    ["Invoice", "Supplier", "Date", "Total", "Paid", "Balance", "Days", "Bucket"],
    ...report.payables.rows.map((r) => [r.ref, r.party, r.date, r.total, r.paid, r.balance, r.days, r.bucket]),
    [],
    ["SALES INVOICES"],
    ["Invoice", "Date", "Customer", "Plate", "Net", "VAT", "Total", "Paid", "Balance", "Status"],
    ...report.sales.map((r) => [r.number, r.date, r.customer, r.plate, r.net, r.vat, r.total, r.paid, r.balance, r.status]),
    [],
    ["PURCHASE INVOICES"],
    ["Invoice", "Date", "Supplier", "Net", "VAT", "Total", "Paid", "Balance", "Status"],
    ...report.purchases.map((r) => [r.number, r.date, r.supplier, r.net, r.vat, r.total, r.paid, r.balance, r.status]),
    [],
    ["PAYMENTS"],
    ["Date", "Direction", "Method", "Against", "Party", "Reference", "Receipt attached", "Amount"],
    ...report.payments.map((r) => [r.date, r.direction, r.method, r.against, r.party, r.reference, r.hasReceipt ? "Yes" : "No", r.amount]),
    [],
    ["CAR EXPENSES"],
    ["Date", "Category", "Vendor", "Description", "Tax invoice", "Reference", "Amount"],
    ...report.expenses.map((e) => [e.date, e.category, e.vendor, e.description, e.hasInvoice ? "Yes" : "No", e.reference, e.amount]),
    [],
    ["AUDIT TRAIL"],
    ["Date & time", "User", "Role", "Action", "Record", "Result", "Details"],
    ...report.audit.map((a) => [a.at, a.actor, a.role, a.action, a.resource, a.status, a.detail]),
  ]
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n")
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `Audit-Report-${report.from}-to-${report.to}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
