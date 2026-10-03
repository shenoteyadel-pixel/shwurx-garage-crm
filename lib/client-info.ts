import "server-only"
import { headers } from "next/headers"

export type DeviceKind = "Phone" | "Tablet" | "PC" | "Unknown"

export interface ClientInfo {
  ip: string
  device: DeviceKind
  os: string
  browser: string
  model: string | null
  ua: string
}

function detectOs(ua: string): string {
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS"
  if (/Android/i.test(ua)) return "Android"
  if (/Windows/i.test(ua)) return "Windows"
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS"
  if (/CrOS/i.test(ua)) return "ChromeOS"
  if (/Linux/i.test(ua)) return "Linux"
  return "Unknown OS"
}

function detectBrowser(ua: string): string {
  if (/Edg\//i.test(ua)) return "Edge"
  if (/OPR\/|Opera/i.test(ua)) return "Opera"
  if (/SamsungBrowser/i.test(ua)) return "Samsung Internet"
  if (/CriOS|Chrome\//i.test(ua)) return "Chrome"
  if (/FxiOS|Firefox\//i.test(ua)) return "Firefox"
  if (/Safari\//i.test(ua)) return "Safari"
  return "Unknown browser"
}

function detectDevice(ua: string): DeviceKind {
  if (!ua) return "Unknown"
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "Tablet"
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return "Phone"
  return "PC"
}

function detectModel(ua: string): string | null {
  if (/iPhone/i.test(ua)) return "iPhone"
  if (/iPad/i.test(ua)) return "iPad"
  const android = ua.match(/Android [\d.]+;\s*([^;)]+?)(?:\s+Build|\))/i)
  const model = android?.[1]?.trim()
  return model && model !== "K" ? model : null
}

/** IP + device of the current request. Never throws (returns "unknown" outside a request). */
export async function getClientInfo(): Promise<ClientInfo | null> {
  try {
    const h = await headers()
    const ua = (h.get("user-agent") || "").slice(0, 400)
    const ip =
      (h.get("x-forwarded-for") || "").split(",")[0].trim() ||
      h.get("x-real-ip") ||
      h.get("cf-connecting-ip") ||
      "unknown"
    return {
      ip,
      device: detectDevice(ua),
      os: detectOs(ua),
      browser: detectBrowser(ua),
      model: detectModel(ua),
      ua,
    }
  } catch {
    return null
  }
}

/** e.g. "Phone (Samsung SM-S918B · Android · Chrome)" */
export function describeDevice(c: Pick<ClientInfo, "device" | "os" | "browser" | "model">): string {
  const parts = [c.model, c.os, c.browser].filter((p) => p && !p.startsWith("Unknown"))
  return parts.length ? `${c.device} (${parts.join(" · ")})` : c.device
}
