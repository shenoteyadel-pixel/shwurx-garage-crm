// Off-database file backup for the SHWURX CRM.
//
// Exports every public table to a timestamped folder of JSON files that you can
// download and keep outside Supabase. This is an ad-hoc local copy; the verified
// daily backup runs automatically in the cloud via /api/cron/backup.
//
// Usage:
//   node --env-file-if-exists=/vercel/share/.env.project scripts/backup-database.mjs
//
// Output: ./backups/<timestamp>/<table>.json  +  _manifest.json

import { createClient } from "@supabase/supabase-js"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("[v0] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.")
  process.exit(1)
}

// Every public base table in the CRM.
const TABLES = [
  "appointments", "approval_item_decisions", "approval_requests", "audit_logs",
  "customer_portal_tokens", "customers", "diagnostic_sessions", "diagnostic_tests",
  "doc_counters", "inventory_items", "invoice_items", "invoices", "jobs", "leads",
  "notifications", "parts_requests", "payments", "permission_overrides", "profiles",
  "purchase_order_items", "purchase_orders", "quotation_items", "quotations",
  "role_permissions", "settings", "stock_movements", "suppliers", "vehicle_photos",
  "vehicles", "website_events",
]

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function fetchAll(table) {
  // Page through in case a table grows beyond the 1000-row default cap.
  const pageSize = 1000
  let from = 0
  const rows = []
  for (;;) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + pageSize - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return rows
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const dir = join(process.cwd(), "backups", stamp)
  await mkdir(dir, { recursive: true })

  const manifest = { created_at: new Date().toISOString(), tables: {}, total_rows: 0 }

  for (const table of TABLES) {
    try {
      const rows = await fetchAll(table)
      await writeFile(join(dir, `${table}.json`), JSON.stringify(rows, null, 2))
      manifest.tables[table] = rows.length
      manifest.total_rows += rows.length
      console.log(`[v0] ${table}: ${rows.length} rows`)
    } catch (err) {
      console.error(`[v0] FAILED ${table}:`, err.message)
      manifest.tables[table] = { error: err.message }
    }
  }

  await writeFile(join(dir, "_manifest.json"), JSON.stringify(manifest, null, 2))
  const failed = Object.entries(manifest.tables).filter(([, v]) => typeof v === "object")
  if (failed.length) {
    console.error(`\n[v0] Backup INCOMPLETE: ${failed.length} table(s) failed: ${failed.map(([t]) => t).join(", ")}`)
    process.exit(1)
  }
  console.log(`\n[v0] Local copy complete: ${manifest.total_rows} rows -> backups/${stamp}/`)
  // Local copies are not reported as the production backup. The verified daily
  // backup runs in the cloud (/api/cron/backup); fetch it with scripts/download-backup.mjs.
}

main().catch((err) => {
  console.error("[v0] Backup failed:", err)
  process.exit(1)
})
