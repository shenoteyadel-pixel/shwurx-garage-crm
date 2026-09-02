"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/* ---------------- Button ---------------- */
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "outline" | "danger" | "success"
  size?: "sm" | "md" | "lg" | "icon"
}
export function Button({ className, variant = "primary", size = "md", ...props }: ButtonProps) {
  const variants: Record<string, string> = {
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
    ghost: "bg-transparent text-foreground hover:bg-accent",
    outline: "border border-border bg-transparent text-foreground hover:bg-accent",
    danger: "bg-red-600 text-white hover:bg-red-500",
    success: "bg-emerald-600 text-white hover:bg-emerald-500",
  }
  const sizes: Record<string, string> = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
    icon: "h-9 w-9",
  }
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}

/* ---------------- Button aliases (convenience wrappers) ---------------- */
export function PrimaryButton(props: ButtonProps) {
  return <Button variant="primary" {...props} />
}
export function GhostButton({ size = "sm", ...props }: ButtonProps) {
  return <Button variant="outline" size={size} {...props} />
}

/* ---------------- Field (label + control wrapper) ---------------- */
export function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label?: string
  htmlFor?: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? <Label htmlFor={htmlFor}>{label}</Label> : null}
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/* ---------------- Input ---------------- */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-10 w-full rounded-lg border border-input bg-background/60 px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        {...props}
      />
    )
  },
)

/* ---------------- Textarea ---------------- */
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "min-h-20 w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        {...props}
      />
    )
  },
)

/* ---------------- AutoTextarea (auto-expanding) ---------------- */
export const AutoTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }
>(function AutoTextarea({ className, minRows = 3, value, onChange, ...props }, ref) {
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null)

  const resize = React.useCallback(() => {
    const el = innerRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [])

  React.useEffect(() => {
    resize()
  }, [resize, value])

  return (
    <textarea
      ref={(node) => {
        innerRef.current = node
        if (typeof ref === "function") ref(node)
        else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node
      }}
      rows={minRows}
      value={value}
      onChange={(e) => {
        onChange?.(e)
        resize()
      }}
      onInput={resize}
      className={cn(
        "w-full resize-none overflow-hidden rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  )
})

/* ---------------- Select ---------------- */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "h-10 w-full rounded-lg border border-input bg-background/60 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    )
  },
)

/* ---------------- Combo (free-text input with suggestions) ---------------- */
export const Combo = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { options?: string[]; listId?: string }
>(function Combo({ className, options = [], listId, id, ...props }, ref) {
  const generatedId = React.useId()
  const dataListId = listId || `${id || "combo"}-${generatedId}`
  return (
    <>
      <input
        ref={ref}
        id={id}
        list={dataListId}
        autoComplete="off"
        className={cn(
          "h-10 w-full rounded-lg border border-input bg-background/60 px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        {...props}
      />
      <datalist id={dataListId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  )
})

/* ---------------- UAEPlate (visual number plate) ---------------- */
export function UAEPlate({
  emirate,
  code,
  number,
  className,
}: {
  emirate?: string | null
  code?: string | null
  number?: string | null
  className?: string
}) {
  if (!emirate && !code && !number) return null
  return (
    <span
      className={cn(
        "inline-flex items-stretch overflow-hidden rounded-md border-2 border-neutral-300 bg-white font-semibold text-neutral-900 shadow-sm",
        className,
      )}
    >
      {emirate && (
        <span className="flex flex-col items-center justify-center border-r border-neutral-300 px-2 py-1 text-center leading-tight">
          <span className="text-[8px] uppercase tracking-wide text-red-600">UAE</span>
          <span className="text-[10px] leading-none">{emirate}</span>
        </span>
      )}
      <span className="flex items-center gap-1.5 px-2.5 py-1 tabular-nums">
        {code && <span className="text-sm">{code}</span>}
        {number && <span className="text-base tracking-wide">{number}</span>}
      </span>
    </span>
  )
}

/* ---------------- Label ---------------- */
export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("mb-1.5 block text-xs font-medium text-muted-foreground", className)} {...props} />
  )
}

/* ---------------- Card ---------------- */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border bg-card", className)} {...props} />
}

/* ---------------- Badge ---------------- */
export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        className,
      )}
      {...props}
    />
  )
}
