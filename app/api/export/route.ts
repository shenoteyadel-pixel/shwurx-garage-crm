import { NextResponse, type NextRequest } from "next/server"
import { strToU8, zipSync } from "fflate"
import { createServiceClient } from "@/lib/supabase/server"
import { getSessionContext, writeAudit } from "@/lib/rbac/context"
import { EXPORT_TABLES } from "@/lib/data-export"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const PAGE = 1000

type Row = Record<string, unknown>

async function fetchAll(table: string): Promise<Row[]> {
  const svc = createServiceClient()
  const rows: Row[] = []
  let ordered = true
  for (let from = 0; ; from += PAGE) {
    let query = svc.from(table).select("*").range(from, from + PAGE - 1)
    if (ordered) query = query.order("id", { ascending: true })
    const { data, error } = await query
    if (error) {
      // A few tables have no `id` column; fall back to unordered paging.
      if (ordered && from === 0) {
        ordered = false
        from -= PAGE
        continue
      }
      throw new Error(`${table}: ${error.message}`)
    }
    rows.push(...((data ?? []) as Row[]))
    if (!data || data.length < PAGE) break
  }
  return rows
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return ""
  let text = typeof value === "object" ? JSON.stringify(value) : String(value)
  // Stop spreadsheet apps from treating text as a formula.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function toCsv(rows: Row[]): string {
  const columns: string[] = []
  const seen = new Set<string>()
  for (const row of rows) for (const key of Object.keys(row)) if (!seen.has(key)) seen.add(key), columns.push(key)
  const lines = [columns.map(cell).join(",")]
  for (const row of rows) lines.push(columns.map((c) => cell(row[c])).join(","))
  return "\uFEFF" + lines.join("\r\n")
}

export async function GET(req: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx || !ctx.isActive || ctx.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can export CRM data." }, { status: 403 })
  }

  const requested = (req.nextUrl.searchParams.get("tables") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => EXPORT_TABLES.has(t))
  const tables = [...new Set(requested)]
  if (tables.length === 0) return NextResponse.json({ error: "No valid datasets selected." }, { status: 400 })

  const stamp = new Date().toISOString().slice(0, 10)

  try {
    const results = await Promise.all(tables.map(async (t) => [t, await fetchAll(t)] as const))

    await writeAudit({
      actorId: ctx.userId,
      actorName: ctx.name,
      actorRole: ctx.role,
      action: "data.export",
      resourceType: "crm",
      detail: { tables, rows: results.reduce((n, [, r]) => n + r.length, 0) },
    })

    if (results.length === 1) {
      const [table, rows] = results[0]
      return new NextResponse(toCsv(rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="shwurx-${table}-${stamp}.csv"`,
          "Cache-Control": "no-store",
        },
      })
    }

    const files: Record<string, Uint8Array> = {}
    for (const [table, rows] of results) files[`${table}.csv`] = strToU8(toCsv(rows))
    const zip = zipSync(files, { level: 6 })
    return new NextResponse(Buffer.from(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="shwurx-crm-export-${stamp}.zip"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Export failed" }, { status: 500 })
  }
}
