import "server-only"
import { createServiceClient } from "@/lib/supabase/server"

export interface StaffContact {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: string
}

/** Active staff holding a permission through their role or a per-user grant (owners always included). */
export async function staffWithPermission(permission: string): Promise<StaffContact[]> {
  const svc = createServiceClient()
  const [{ data: roleRows }, { data: overrides }] = await Promise.all([
    svc.from("role_permissions").select("role").eq("permission", permission).eq("allowed", true),
    svc.from("permission_overrides").select("user_id, allowed").eq("permission", permission),
  ])
  const roles = Array.from(new Set(["owner", ...(roleRows ?? []).map((r) => r.role as string)]))
  const granted = (overrides ?? []).filter((o) => o.allowed).map((o) => o.user_id as string)
  const denied = new Set((overrides ?? []).filter((o) => !o.allowed).map((o) => o.user_id as string))

  const filter = granted.length ? `role.in.(${roles.join(",")}),id.in.(${granted.join(",")})` : `role.in.(${roles.join(",")})`
  const { data: users } = await svc
    .from("profiles")
    .select("id, full_name, email, phone, mobile, role, is_active")
    .or(filter)
    .eq("is_active", true)
  return (users ?? [])
    .filter((u) => u.role === "owner" || !denied.has(u.id as string))
    .map((u) => ({
      id: u.id as string,
      name: (u.full_name as string) || (u.email as string) || "Staff",
      email: (u.email as string) || null,
      phone: (u.mobile as string) || (u.phone as string) || null,
      role: u.role as string,
    }))
}

export async function staffByIds(ids: string[]): Promise<StaffContact[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (!unique.length) return []
  const svc = createServiceClient()
  const { data } = await svc
    .from("profiles")
    .select("id, full_name, email, phone, mobile, role, is_active")
    .in("id", unique)
    .eq("is_active", true)
  return (data ?? []).map((u) => ({
    id: u.id as string,
    name: (u.full_name as string) || (u.email as string) || "Staff",
    email: (u.email as string) || null,
    phone: (u.mobile as string) || (u.phone as string) || null,
    role: u.role as string,
  }))
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export function alertEmailHtml(opts: { title: string; lines: string[]; ctaLabel: string; ctaUrl: string; tone?: "warn" | "danger" | "ok" }) {
  const accent = opts.tone === "danger" ? "#dc2626" : opts.tone === "ok" ? "#16a34a" : "#7c3aed"
  const body = opts.lines.map((l) => `<p style="margin:0 0 8px">${escapeHtml(l)}</p>`).join("")
  return `<!doctype html><html><body style="margin:0;background:#f5f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937;padding:24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
      <tr><td style="height:4px;background:${accent}"></td></tr>
      <tr><td style="padding:24px 28px 8px">
        <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${accent};font-weight:700">SHWURX Auto Service Center</div>
        <h1 style="margin:10px 0 0;font-size:19px;color:#111827">${escapeHtml(opts.title)}</h1>
      </td></tr>
      <tr><td style="padding:8px 28px;font-size:14px;line-height:1.6;color:#374151">${body}</td></tr>
      <tr><td style="padding:16px 28px 26px">
        <a href="${opts.ctaUrl}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 20px;border-radius:8px">${escapeHtml(opts.ctaLabel)}</a>
      </td></tr>
    </table>
  </td></tr></table></body></html>`
}
