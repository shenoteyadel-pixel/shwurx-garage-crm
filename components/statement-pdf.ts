"use client"

export type StatementCompany = { name: string; trn: string | null; address: string | null }
export type StatementCol = { label: string; w: number; right?: boolean }
export type StatementSection = { title: string; cols: StatementCol[]; rows: string[][]; empty?: string }

const GREEN: [number, number, number] = [95, 214, 34]
const INK: [number, number, number] = [23, 23, 23]
const GREY: [number, number, number] = [110, 110, 110]
const LINE: [number, number, number] = [215, 215, 215]

export function money(n: number) {
  return `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function pdfDate(v: string | null | undefined) {
  if (!v) return "—"
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dubai" })
}

export async function buildStatementPdf(opts: {
  company: StatementCompany
  title: string
  subtitle?: string
  party: { name: string; lines: string[] }
  summary: { label: string; value: string }[]
  sections: StatementSection[]
  footerNote?: string
  fileName: string
}) {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 12
  let y = M

  const header = () => {
    doc.setFillColor(...GREEN)
    doc.rect(0, 0, W, 3, "F")
    doc.setTextColor(...INK)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(13)
    doc.text(opts.company.name || "Company", M, 13)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...GREY)
    const sub = [opts.company.trn ? `TRN ${opts.company.trn}` : null, opts.company.address].filter(Boolean).join("  ·  ")
    if (sub) doc.text(doc.splitTextToSize(sub, W / 2 - M)[0] ?? "", M, 18)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(12)
    doc.setTextColor(...INK)
    doc.text(opts.title, W - M, 13, { align: "right" })
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...GREY)
    doc.text(
      opts.subtitle ?? `Generated ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai" })}`,
      W - M,
      18,
      { align: "right" },
    )
    y = 26
  }

  const ensure = (space: number) => {
    if (y + space > H - 14) {
      doc.addPage()
      header()
      return true
    }
    return false
  }

  header()

  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(...GREY)
  doc.text("STATEMENT FOR", M, y)
  y += 5
  doc.setFontSize(11)
  doc.setTextColor(...INK)
  doc.text(opts.party.name, M, y)
  y += 5
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...GREY)
  for (const line of opts.party.lines.filter(Boolean)) {
    doc.text(line, M, y)
    y += 4
  }
  y += 3

  if (opts.summary.length) {
    const boxW = (W - 2 * M - (opts.summary.length - 1) * 3) / opts.summary.length
    opts.summary.forEach((s, i) => {
      const x = M + i * (boxW + 3)
      doc.setDrawColor(...LINE)
      doc.roundedRect(x, y, boxW, 14, 1.5, 1.5, "S")
      doc.setFont("helvetica", "normal")
      doc.setFontSize(7)
      doc.setTextColor(...GREY)
      doc.text(s.label.toUpperCase(), x + 3, y + 5)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(10)
      doc.setTextColor(...INK)
      doc.text(s.value, x + 3, y + 11)
    })
    y += 21
  }

  for (const section of opts.sections) {
    ensure(18)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.setTextColor(...INK)
    doc.text(section.title, M, y)
    y += 3
    const drawHead = () => {
      doc.setFillColor(244, 244, 244)
      doc.rect(M, y, W - 2 * M, 6, "F")
      doc.setFont("helvetica", "bold")
      doc.setFontSize(7.5)
      doc.setTextColor(...GREY)
      let x = M + 2
      for (const c of section.cols) {
        doc.text(c.label, c.right ? x + c.w - 4 : x, y + 4, { align: c.right ? "right" : "left" })
        x += c.w
      }
      y += 6
    }
    drawHead()
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    if (section.rows.length === 0) {
      doc.setTextColor(...GREY)
      doc.text(section.empty ?? "No records.", M + 2, y + 4)
      y += 6
    }
    for (const r of section.rows) {
      if (ensure(6)) {
        drawHead()
        doc.setFont("helvetica", "normal")
        doc.setFontSize(8)
      }
      doc.setTextColor(...INK)
      let x = M + 2
      r.forEach((cell, i) => {
        const c = section.cols[i]
        const txt = doc.splitTextToSize(cell ?? "", c.w - 3)[0] ?? ""
        doc.text(txt, c.right ? x + c.w - 4 : x, y + 4, { align: c.right ? "right" : "left" })
        x += c.w
      })
      doc.setDrawColor(...LINE)
      doc.line(M, y + 6, W - M, y + 6)
      y += 6
    }
    y += 7
  }

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...GREY)
    doc.text(`Page ${i} of ${pages}`, W - M, H - 6, { align: "right" })
    if (opts.footerNote) doc.text(opts.footerNote, M, H - 6)
  }

  doc.save(opts.fileName)
}
