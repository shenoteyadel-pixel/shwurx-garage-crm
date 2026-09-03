import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(n: number | null | undefined) {
  const v = Number(n ?? 0)
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
  }).format(v)
}

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—"
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function relativeHours(from: string | Date, to: string | Date = new Date()) {
  const ms = new Date(to).getTime() - new Date(from).getTime()
  return ms / 36e5
}

/** Largest plausible odometer reading (km). Guards against typo values like 49,276,000. */
export const MAX_MILEAGE_KM = 2_000_000

/**
 * Normalize a user-entered mileage value. Returns a clean non-negative integer
 * within a realistic range, or null when the input is empty/invalid/absurd so a
 * mistyped odometer can't be persisted.
 */
export function sanitizeMileage(value: FormDataEntryValue | string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 0 || n > MAX_MILEAGE_KM) return null
  return n
}
