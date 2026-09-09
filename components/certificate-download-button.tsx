"use client"

import * as React from "react"
import { Download } from "lucide-react"

export type CertificateItem = {
  name: string
  partNumber: string | null
  detail: string | null
  category: string
  gross: string
}

export type CertificateData = {
  fileName: string
  company: {
    legalName: string
    brand: string | null
    address: string | null
    phone: string | null
    email: string | null
    tradeLicense: string | null
    trn: string | null
  }
  doc: {
    certificateNumber: string | null
    jobNumber: string
    version: string | number
    decided: string
    statusLabel: string
    kindLabel: string
  }
  customer: { name: string; mobile: string | null }
  vehicle: { label: string; plate: string | null; mileage: string | null; vin: string | null }
  approvedItems: CertificateItem[]
  declinedItems: CertificateItem[]
  totals: { subtotal: string; vatRate: string | number; vat: string; total: string }
  declaration: string
  signature: { image: string | null; signerName: string; comment: string | null }
  audit: { certificate: string; signedAt: string; ip: string; reference: string; userAgent: string | null }
}

const RED: [number, number, number] = [229, 31, 43]
const INK: [number, number, number] = [23, 23, 23]
const GREY: [number, number, number] = [115, 115, 115]
const LIGHT: [number, number, number] = [212, 212, 212]

// Re-encode the signature through a canvas so jsPDF gets a clean, uniformly
// encoded PNG (the raw stored data URL can trip jsPDF's strict PNG parser).
// Returns a data URL, or null if the image can't be loaded.
function normalizeSignature(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas")
        canvas.width = img.naturalWidth || 480
        canvas.height = img.naturalHeight || 160
        const ctx = canvas.getContext("2d")
        if (!ctx) return resolve(null)
        // White backing so a transparent signature stays visible in the PDF.
        ctx.fillStyle = "#ffffff"
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL("image/png"))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

export function CertificateDownloadButton({ data }: { data: CertificateData }) {
  const [busy, setBusy] = React.useState(false)

  async function handleDownload() {
    setBusy(true)
    try {
      const { jsPDF } = await import("jspdf")
      const doc = new jsPDF({ unit: "pt", format: "a4" })
      const pageW = doc.internal.pageSize.getWidth()
      const pageH = doc.internal.pageSize.getHeight()
      const M = 48 // margin
      const contentW = pageW - M * 2
      let y = M

      const ensure = (needed: number) => {
        if (y + needed > pageH - M) {
          doc.addPage()
          y = M
        }
      }

      // ---- Header ----
      doc.setTextColor(...INK)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(16)
      doc.text(data.company.legalName.toUpperCase(), M, y + 4)

      doc.setFont("helvetica", "bold")
      doc.setFontSize(13)
      const title = "APPROVAL CERTIFICATE"
      doc.text(title, pageW - M, y + 2, { align: "right" })
      y += 18

      if (data.company.brand) {
        doc.setFont("helvetica", "bold")
        doc.setFontSize(8.5)
        doc.setTextColor(...RED)
        doc.text(data.company.brand, M, y)
      }
      doc.setTextColor(...GREY)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8.5)
      if (data.doc.certificateNumber) {
        doc.setFont("helvetica", "bold")
        doc.setTextColor(...INK)
        doc.text(data.doc.certificateNumber, pageW - M, y, { align: "right" })
        doc.setFont("helvetica", "normal")
        doc.setTextColor(...GREY)
      }
      y += 12
      doc.text(`${data.doc.jobNumber}  ·  v${data.doc.version}`, pageW - M, y, { align: "right" })
      // company contact lines (left)
      const contact: string[] = []
      if (data.company.address) contact.push(data.company.address)
      const line2 = [data.company.phone ? `Tel ${data.company.phone}` : "", data.company.email ?? ""]
        .filter(Boolean)
        .join("   ")
      if (line2) contact.push(line2)
      const line3 = [
        data.company.tradeLicense ? `Trade License: ${data.company.tradeLicense}` : "",
        data.company.trn ? `TRN: ${data.company.trn}` : "",
      ]
        .filter(Boolean)
        .join("   ")
      if (line3) contact.push(line3)
      let cy = y - 12
      for (const l of contact) {
        doc.text(l, M, cy + 12)
        cy += 11
      }
      y = Math.max(y, cy) + 6
      doc.text(data.doc.decided, pageW - M, y, { align: "right" })
      y += 10

      // header rule
      doc.setDrawColor(...RED)
      doc.setLineWidth(1.5)
      doc.line(M, y, pageW - M, y)
      y += 20

      // ---- Parties row (3 columns) ----
      const colW = contentW / 3
      const label = (t: string, x: number) => {
        doc.setFont("helvetica", "bold")
        doc.setFontSize(7)
        doc.setTextColor(...GREY)
        doc.text(t.toUpperCase(), x, y)
      }
      label("Customer", M)
      label("Vehicle", M + colW)
      label("Outcome", M + colW * 2)
      y += 13

      doc.setFontSize(9.5)
      doc.setTextColor(...INK)
      doc.setFont("helvetica", "bold")
      doc.text(data.customer.name || "—", M, y)
      doc.text(data.vehicle.label || "—", M + colW, y)
      doc.text(data.doc.statusLabel, M + colW * 2, y)

      doc.setFont("helvetica", "normal")
      doc.setFontSize(8.5)
      doc.setTextColor(...GREY)
      let ay = y + 12
      if (data.customer.mobile) doc.text(data.customer.mobile, M, ay)
      const vSub = [data.vehicle.plate ? `Plate ${data.vehicle.plate}` : "", data.vehicle.mileage ?? ""]
        .filter(Boolean)
        .join("  ·  ")
      if (vSub) doc.text(vSub, M + colW, ay)
      doc.text(data.doc.kindLabel, M + colW * 2, ay)
      if (data.vehicle.vin) {
        doc.text(`VIN ${data.vehicle.vin}`, M + colW, ay + 11)
      }
      y = ay + 24

      // ---- Item sections ----
      const drawItems = (heading: string, items: CertificateItem[], tone: [number, number, number]) => {
        ensure(30)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(8)
        doc.setTextColor(...tone)
        doc.text(heading.toUpperCase(), M, y)
        y += 6
        doc.setDrawColor(...LIGHT)
        doc.setLineWidth(0.5)
        doc.line(M, y, pageW - M, y)
        y += 12

        if (items.length === 0) {
          doc.setFont("helvetica", "normal")
          doc.setFontSize(8.5)
          doc.setTextColor(...GREY)
          doc.text("None.", M, y)
          y += 16
          return
        }

        for (const it of items) {
          const detailLines = it.detail ? doc.splitTextToSize(it.detail, contentW - 200) : []
          const rowH = 16 + (it.partNumber ? 10 : 0) + detailLines.length * 10
          ensure(rowH)
          doc.setFont("helvetica", "bold")
          doc.setFontSize(9)
          doc.setTextColor(...INK)
          doc.text(it.name, M, y)
          // category + price on the right
          doc.setFont("helvetica", "normal")
          doc.setFontSize(8.5)
          doc.setTextColor(...GREY)
          doc.text(it.category, pageW - M - 90, y, { align: "right" })
          doc.setTextColor(...INK)
          doc.text(it.gross, pageW - M, y, { align: "right" })
          let ry = y + 10
          if (it.partNumber) {
            doc.setTextColor(...GREY)
            doc.setFontSize(8)
            doc.text(`#${it.partNumber}`, M, ry)
            ry += 10
          }
          if (detailLines.length) {
            doc.setTextColor(...GREY)
            doc.setFontSize(8)
            doc.text(detailLines, M, ry)
            ry += detailLines.length * 10
          }
          y = ry + 6
          doc.setDrawColor(...LIGHT)
          doc.setLineWidth(0.25)
          doc.line(M, y - 3, pageW - M, y - 3)
        }
        y += 8
      }

      drawItems("Approved — authorized for work", data.approvedItems, [21, 128, 61])
      if (data.declinedItems.length > 0) {
        drawItems("Declined — not authorized", data.declinedItems, [185, 28, 28])
      }

      // ---- Totals ----
      ensure(70)
      const tx = pageW - M - 200
      const totalRow = (l: string, v: string, bold = false) => {
        doc.setFont("helvetica", bold ? "bold" : "normal")
        doc.setFontSize(bold ? 10.5 : 9)
        doc.setTextColor(...(bold ? INK : GREY))
        doc.text(l, tx, y)
        doc.setTextColor(...INK)
        doc.text(v, pageW - M, y, { align: "right" })
        y += bold ? 16 : 13
      }
      totalRow("Approved subtotal", data.totals.subtotal)
      totalRow(`VAT (${data.totals.vatRate}%)`, data.totals.vat)
      doc.setDrawColor(...INK)
      doc.setLineWidth(1)
      doc.line(tx, y - 4, pageW - M, y - 4)
      y += 6
      totalRow("Approved total", data.totals.total, true)
      y += 8

      // ---- Declaration ----
      ensure(60)
      const decLines = doc.splitTextToSize(data.declaration, contentW - 20)
      const decH = decLines.length * 11 + 20
      doc.setDrawColor(...LIGHT)
      doc.setFillColor(250, 250, 250)
      doc.setLineWidth(0.5)
      doc.roundedRect(M, y, contentW, decH, 4, 4, "FD")
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8.5)
      doc.setTextColor(...GREY)
      doc.text(decLines, M + 10, y + 15)
      y += decH + 20

      // ---- Signature + audit (2 columns) ----
      ensure(140)
      const sigColW = contentW / 2 - 10
      doc.setFont("helvetica", "bold")
      doc.setFontSize(7)
      doc.setTextColor(...GREY)
      doc.text("CUSTOMER SIGNATURE", M, y)
      doc.text("AUDIT RECORD", M + contentW / 2 + 10, y)
      const sigTop = y + 8

      // signature image box
      const boxW = Math.min(220, sigColW)
      const boxH = 70
      doc.setDrawColor(...LIGHT)
      doc.setLineWidth(0.5)
      doc.rect(M, sigTop, boxW, boxH)
      if (data.signature.image) {
        const png = await normalizeSignature(data.signature.image)
        if (png) {
          try {
            doc.addImage(png, "PNG", M + 4, sigTop + 4, boxW - 8, boxH - 8, undefined, "FAST")
          } catch {
            /* if the signature still can't be decoded, leave the empty box */
          }
        }
      }
      let sy = sigTop + boxH + 14
      doc.setFont("helvetica", "bold")
      doc.setFontSize(9.5)
      doc.setTextColor(...INK)
      doc.text(data.signature.signerName || data.customer.name || "—", M, sy)
      if (data.signature.comment) {
        sy += 12
        doc.setFont("helvetica", "italic")
        doc.setFontSize(8)
        doc.setTextColor(...GREY)
        const cLines = doc.splitTextToSize(`"${data.signature.comment}"`, boxW)
        doc.text(cLines, M, sy)
      }

      // audit column
      const auditX = M + contentW / 2 + 10
      const auditValX = pageW - M
      let auditY = sigTop + 6
      const auditRow = (k: string, v: string) => {
        doc.setFont("helvetica", "normal")
        doc.setFontSize(8.5)
        doc.setTextColor(...GREY)
        doc.text(k, auditX, auditY)
        doc.setTextColor(...INK)
        const vLines = doc.splitTextToSize(v, contentW / 2 - 80)
        doc.text(vLines, auditValX, auditY, { align: "right" })
        auditY += Math.max(13, vLines.length * 11)
      }
      auditRow("Certificate", data.audit.certificate)
      auditRow("Signed at", data.audit.signedAt)
      auditRow("IP address", data.audit.ip)
      auditRow("Reference", data.audit.reference)
      if (data.audit.userAgent) {
        auditY += 2
        doc.setFont("helvetica", "normal")
        doc.setFontSize(6.5)
        doc.setTextColor(...GREY)
        const uaLines = doc.splitTextToSize(data.audit.userAgent, contentW / 2 - 10)
        doc.text(uaLines, auditX, auditY)
      }

      y = Math.max(sy, auditY) + 24

      // ---- Footer ----
      ensure(30)
      doc.setDrawColor(...LIGHT)
      doc.setLineWidth(0.5)
      doc.line(M, y, pageW - M, y)
      y += 14
      doc.setFont("helvetica", "normal")
      doc.setFontSize(7.5)
      doc.setTextColor(...GREY)
      const footer =
        "This certificate records the customer's digitally-signed authorization. Only approved items will be carried out and invoiced." +
        (data.company.brand ? `  Thank you for choosing ${data.company.brand}.` : "")
      const fLines = doc.splitTextToSize(footer, contentW)
      doc.text(fLines, pageW / 2, y, { align: "center" })

      doc.save(data.fileName)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={busy}
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#e51f2b] px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60 print:hidden"
    >
      <Download className="h-4 w-4" /> {busy ? "Preparing…" : "Download PDF"}
    </button>
  )
}
