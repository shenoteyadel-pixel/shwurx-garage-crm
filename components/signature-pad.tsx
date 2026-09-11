"use client"

import * as React from "react"

export type SignaturePadHandle = {
  isEmpty: () => boolean
  toDataURL: () => string
  clear: () => void
}

export const SignaturePad = React.forwardRef<SignaturePadHandle, { className?: string }>(
  function SignaturePad({ className }, ref) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null)
    const drawing = React.useRef(false)
    const dirty = React.useRef(false)

    React.useImperativeHandle(ref, () => ({
      isEmpty: () => !dirty.current,
      toDataURL: () => {
        const c = canvasRef.current
        if (!c) return ""
        // The live canvas is sized at devicePixelRatio (2.5-4x on phones), which
        // makes a full-res PNG large and slow to upload on mobile. Downscale to a
        // capped width on a white background before export so the payload stays
        // small and reliable to send.
        const maxWidth = 600
        const scale = c.width > maxWidth ? maxWidth / c.width : 1
        const out = document.createElement("canvas")
        out.width = Math.round(c.width * scale)
        out.height = Math.round(c.height * scale)
        const octx = out.getContext("2d")
        if (!octx) return c.toDataURL("image/png")
        octx.fillStyle = "#ffffff"
        octx.fillRect(0, 0, out.width, out.height)
        octx.drawImage(c, 0, 0, out.width, out.height)
        return out.toDataURL("image/jpeg", 0.85)
      },
      clear: () => {
        const c = canvasRef.current
        if (!c) return
        const ctx = c.getContext("2d")!
        ctx.clearRect(0, 0, c.width, c.height)
        dirty.current = false
      },
    }))

    React.useEffect(() => {
      const c = canvasRef.current
      if (!c) return
      const ratio = window.devicePixelRatio || 1
      const rect = c.getBoundingClientRect()
      c.width = rect.width * ratio
      c.height = rect.height * ratio
      const ctx = c.getContext("2d")!
      ctx.scale(ratio, ratio)
      ctx.lineWidth = 2.5
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.strokeStyle = "#111"
    }, [])

    function pos(e: React.PointerEvent) {
      const rect = canvasRef.current!.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    function start(e: React.PointerEvent) {
      e.preventDefault()
      drawing.current = true
      dirty.current = true
      const ctx = canvasRef.current!.getContext("2d")!
      const { x, y } = pos(e)
      ctx.beginPath()
      ctx.moveTo(x, y)
    }
    function move(e: React.PointerEvent) {
      if (!drawing.current) return
      const ctx = canvasRef.current!.getContext("2d")!
      const { x, y } = pos(e)
      ctx.lineTo(x, y)
      ctx.stroke()
    }
    function end() {
      drawing.current = false
    }

    return (
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className={className}
        style={{ touchAction: "none" }}
      />
    )
  },
)
