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
      toDataURL: () => canvasRef.current?.toDataURL("image/png") ?? "",
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
