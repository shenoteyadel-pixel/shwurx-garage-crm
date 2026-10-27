"use client"

import { useState } from "react"

const TIER_ACCENT: Record<string, string> = { member: "#39d353", silver: "#c0c4cc", vip: "#d4af37" }

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function drawCard(p: { name: string; membershipNumber: string; tier: string; points: number; qrDataUrl: string }) {
  const w = 1012
  const h = 1400
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")!
  const accent = TIER_ACCENT[p.tier] ?? TIER_ACCENT.member

  ctx.fillStyle = "#0b0b0d"
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = accent
  ctx.fillRect(0, 0, w, 10)

  try {
    const logo = await loadImage("/brand/shwurx-logo.png")
    const lh = 110
    ctx.drawImage(logo, 64, 64, (logo.width / logo.height) * lh, lh)
  } catch {
    ctx.fillStyle = "#e5e7eb"
    ctx.font = "bold 56px sans-serif"
    ctx.fillText("SWURX AUTO", 64, 140)
  }

  ctx.strokeStyle = accent
  ctx.lineWidth = 4
  ctx.font = "bold 36px sans-serif"
  const label = p.tier.toUpperCase()
  const lw = ctx.measureText(label).width + 56
  ctx.beginPath()
  ctx.roundRect(w - 64 - lw, 84, lw, 68, 34)
  ctx.stroke()
  ctx.fillStyle = accent
  ctx.fillText(label, w - 64 - lw + 28, 132)

  ctx.fillStyle = "#9ca3af"
  ctx.font = "32px sans-serif"
  ctx.fillText("SWURX LOYALTY MEMBER", 64, 300)
  ctx.fillStyle = "#f3f4f6"
  ctx.font = "bold 72px sans-serif"
  ctx.fillText(p.name, 64, 390, w - 128)
  ctx.font = "48px monospace"
  ctx.fillText(p.membershipNumber, 64, 470)
  ctx.fillStyle = accent
  ctx.font = "bold 48px sans-serif"
  ctx.fillText(`${p.points.toLocaleString("en-AE")} points`, 64, 550)

  const qr = await loadImage(p.qrDataUrl)
  const qs = 560
  const qx = (w - qs) / 2
  const qy = 660
  ctx.fillStyle = "#ffffff"
  ctx.beginPath()
  ctx.roundRect(qx - 32, qy - 32, qs + 64, qs + 64, 24)
  ctx.fill()
  ctx.drawImage(qr, qx, qy, qs, qs)

  ctx.fillStyle = "#9ca3af"
  ctx.font = "32px sans-serif"
  ctx.textAlign = "center"
  ctx.fillText("Show this at the SWURX service desk", w / 2, 1340)

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png"),
  )
}

export function LoyaltySaveCard(props: {
  name: string
  membershipNumber: string
  tier: string
  points: number
  qrDataUrl: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const blob = await drawCard(props)
      const fileName = `SWURX-card-${props.membershipNumber}.png`
      const file = new File([blob], fileName, { type: "image/png" })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "My SWURX Rewards card" }).catch(() => {})
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = fileName
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch {
      setError("Couldn't save the card. Please take a screenshot instead.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="h-12 rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-60"
      >
        {busy ? "Preparing card..." : "Save card to my phone"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
