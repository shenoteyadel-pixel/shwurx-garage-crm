"use client"

import { useState } from "react"
import { CARD_BLACK, CARD_BRANDS, CARD_GREEN, CARD_PURPLE, CARD_SILVER, TIER_LABEL, type CardTier } from "./loyalty-card-visual"

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, align: "left" | "right" | "center" = "left") {
  const chars = [...text]
  const width = chars.reduce((s, c) => s + ctx.measureText(c).width + spacing, -spacing)
  let cx = align === "left" ? x : align === "right" ? x - width : x - width / 2
  const prev = ctx.textAlign
  ctx.textAlign = "left"
  for (const c of chars) {
    ctx.fillText(c, cx, y)
    cx += ctx.measureText(c).width + spacing
  }
  ctx.textAlign = prev
}

async function drawFront(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, p: Props) {
  const h = Math.round(w / 1.586)
  const s = w / 1000
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 36 * s)
  ctx.clip()

  const bg = ctx.createLinearGradient(x, y, x + w, y + h)
  bg.addColorStop(0, "#141418")
  bg.addColorStop(0.55, CARD_BLACK)
  bg.addColorStop(1, "#0d0d10")
  ctx.fillStyle = bg
  ctx.fillRect(x, y, w, h)

  const [car, logo, ...brands] = await Promise.all([
    loadImage("/brand/card-car.png").catch(() => null),
    loadImage("/brand/shwurx-logo.png").catch(() => null),
    ...CARD_BRANDS.map((b) => loadImage(`/brands/${b}.svg`).catch(() => null)),
  ])

  if (car) {
    const cw = w * 0.62
    const ch = h * 0.56
    const cx = x + w - cw
    const cy = y + h * 0.26
    const off = document.createElement("canvas")
    off.width = cw
    off.height = ch
    const o = off.getContext("2d")!
    const scale = Math.max(cw / car.width, ch / car.height)
    o.drawImage(car, 0, (ch - car.height * scale) / 2, car.width * scale, car.height * scale)
    o.globalCompositeOperation = "destination-in"
    const fade = o.createLinearGradient(0, 0, cw, 0)
    fade.addColorStop(0, "rgba(0,0,0,0)")
    fade.addColorStop(0.35, "rgba(0,0,0,1)")
    o.fillStyle = fade
    o.fillRect(0, 0, cw, ch)
    ctx.drawImage(off, cx, cy)
  }

  ctx.strokeStyle = `${CARD_GREEN}99`
  ctx.lineWidth = 2 * s
  ctx.beginPath()
  ctx.moveTo(x + w * 0.3, y + h)
  ctx.lineTo(x + w * 0.62, y)
  ctx.stroke()
  ctx.fillStyle = `${CARD_PURPLE}66`
  ctx.beginPath()
  ctx.moveTo(x + w * 0.86, y + h)
  ctx.lineTo(x + w * 0.92, y + h)
  ctx.lineTo(x + w, y + h * 0.78)
  ctx.lineTo(x + w, y + h * 0.62)
  ctx.closePath()
  ctx.fill()

  const pad = 55 * s
  if (logo) {
    const lh = 130 * s
    ctx.drawImage(logo, x + pad, y + pad, (logo.width / logo.height) * lh, lh)
  }

  ctx.fillStyle = CARD_SILVER
  ctx.font = `500 ${24 * s}px sans-serif`
  spaced(ctx, "LOYALTY", x + w - pad, y + pad + 24 * s, 8 * s, "right")
  spaced(ctx, "MEMBER", x + w - pad, y + pad + 58 * s, 8 * s, "right")
  const label = TIER_LABEL[p.tier as CardTier] ?? "MEMBER"
  const tierColor = p.tier === "vip" ? "#d4af37" : CARD_GREEN
  ctx.font = `600 ${20 * s}px sans-serif`
  const tw = ctx.measureText(label).width + 36 * s
  ctx.strokeStyle = tierColor
  ctx.lineWidth = 2 * s
  ctx.beginPath()
  ctx.roundRect(x + w - pad - tw, y + pad + 76 * s, tw, 34 * s, 17 * s)
  ctx.stroke()
  ctx.fillStyle = tierColor
  ctx.textAlign = "center"
  ctx.fillText(label, x + w - pad - tw / 2, y + pad + 100 * s)
  ctx.textAlign = "left"

  const chipX = x + pad
  const chipY = y + h * 0.36
  const chipW = 110 * s
  const chipH = 85 * s
  const gold = ctx.createLinearGradient(chipX, chipY, chipX + chipW, chipY + chipH)
  gold.addColorStop(0, "#f3d27a")
  gold.addColorStop(0.55, "#b8862f")
  gold.addColorStop(1, "#e9c46a")
  ctx.fillStyle = gold
  ctx.beginPath()
  ctx.roundRect(chipX, chipY, chipW, chipH, 16 * s)
  ctx.fill()
  ctx.strokeStyle = "rgba(0,0,0,0.25)"
  ctx.lineWidth = 2 * s
  for (const f of [0.33, 0.67]) {
    ctx.beginPath()
    ctx.moveTo(chipX + chipW * f, chipY)
    ctx.lineTo(chipX + chipW * f, chipY + chipH)
    ctx.moveTo(chipX, chipY + chipH * f)
    ctx.lineTo(chipX + chipW, chipY + chipH * f)
    ctx.stroke()
  }
  ctx.strokeStyle = CARD_SILVER
  ctx.lineWidth = 4 * s
  ctx.lineCap = "round"
  for (const [i, r] of [18, 30, 42].entries()) {
    ctx.beginPath()
    ctx.arc(chipX + chipW + 30 * s, chipY + chipH / 2, r * s, -0.9, 0.9)
    ctx.stroke()
    void i
  }

  ctx.fillStyle = "#f3f4f6"
  ctx.font = `500 ${46 * s}px sans-serif`
  spaced(ctx, p.name.slice(0, 26), x + pad, y + h * 0.66, 6 * s)
  ctx.fillStyle = CARD_SILVER
  ctx.font = `${20 * s}px sans-serif`
  spaced(ctx, "MEMBER ID", x + pad, y + h * 0.71, 5 * s)
  ctx.font = `${40 * s}px monospace`
  spaced(ctx, p.membershipNumber, x + pad, y + h * 0.78, 6 * s)
  ctx.fillStyle = CARD_GREEN
  ctx.font = `600 ${32 * s}px sans-serif`
  ctx.textAlign = "right"
  ctx.fillText(`${p.points.toLocaleString("en-AE")} pts`, x + w - pad, y + h * 0.78)
  ctx.textAlign = "left"

  const rowY = y + h * 0.83
  ctx.strokeStyle = "rgba(255,255,255,0.12)"
  ctx.lineWidth = 1.5 * s
  ctx.beginPath()
  ctx.moveTo(x + pad, rowY)
  ctx.lineTo(x + w - pad, rowY)
  ctx.stroke()
  const slot = (w - pad * 2) / CARD_BRANDS.length
  ctx.filter = "brightness(0) invert(1)"
  ctx.globalAlpha = 0.8
  brands.forEach((img, i) => {
    if (!img) return
    const bh = 38 * s
    const bw = Math.min(70 * s, (img.width / img.height) * bh)
    const bhh = bw / (img.width / img.height)
    ctx.drawImage(img, x + pad + slot * i + (slot - bw) / 2, rowY + 14 * s + (bh - bhh) / 2, bw, bhh)
  })
  ctx.filter = "none"
  ctx.globalAlpha = 0.7
  ctx.fillStyle = CARD_SILVER
  ctx.font = `${17 * s}px sans-serif`
  spaced(ctx, "ONE GARAGE LIMITLESS SOLUTION", x + w / 2, y + h - 22 * s, 9 * s, "center")
  ctx.globalAlpha = 1
  ctx.restore()

  ctx.strokeStyle = "rgba(255,255,255,0.1)"
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 36 * s)
  ctx.stroke()
  return h
}

async function drawCard(p: Props) {
  const w = 1080
  const h = 1720
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#000000"
  ctx.fillRect(0, 0, w, h)

  const cardH = await drawFront(ctx, 40, 60, w - 80, p)

  const top = 60 + cardH + 70
  ctx.fillStyle = CARD_SILVER
  ctx.font = "500 30px sans-serif"
  spaced(ctx, "SWURX LOYALTY PROGRAM", w / 2, top, 8, "center")

  const qr = await loadImage(p.qrDataUrl)
  const qs = 520
  const qx = (w - qs) / 2
  const qy = top + 60
  ctx.fillStyle = "#ffffff"
  ctx.beginPath()
  ctx.roundRect(qx - 36, qy - 36, qs + 72, qs + 72, 28)
  ctx.fill()
  ctx.drawImage(qr, qx, qy, qs, qs)

  ctx.fillStyle = "#9ca3af"
  ctx.font = "30px sans-serif"
  ctx.textAlign = "center"
  ctx.fillText("Show this at the SWURX service desk", w / 2, qy + qs + 110)
  ctx.fillStyle = CARD_GREEN
  ctx.font = "28px sans-serif"
  ctx.fillText("www.swurxauto.com", w / 2, qy + qs + 160)

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png"),
  )
}

type Props = {
  name: string
  membershipNumber: string
  tier: string
  points: number
  qrDataUrl: string
}

export function LoyaltySaveCard(props: Props) {
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
        {busy ? "Preparing card..." : "Save card image to my phone"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
