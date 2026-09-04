// Restore the CRM from an off-database file backup produced by backup-database.mjs.
//
// SAFETY: This is destructive by nature (it overwrites current table contents).
// It therefore does TWO things before touching data:
//   1. Refuses to run without an explicit backup folder argument.
//   2. Restores in child->parent-safe order via upsert (no deletes) by default;
//      pass --replace to fully clear+reload a table.
//
// Prefer the in-database restore (backups.restore_snapshot) for full restores —
// it auto-snapshots first. Use this script when reloading from a downloaded file.
//
// Usage:
//   node --env-file-if-exists=/vercel/share/.env.project scripts/restore-database.mjs backups/<timestamp>
//   node --env-file-if-exists=/vercel/share/.env.project scripts/restore-database.mjs backups/<timestamp> --replace

import { createClient } from "@supabase/supabase-js"
import { readFile, readdir } from "node:fs/promises"
import { join } from "node:path"

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const folder = process.argv[2]
const replace = process.argv.includes("--replace")

if (!folder) {
  console.error("[v0] Usage: node scripts/restore-database.mjs backups/<timestamp> [--replace]")
  process.exit(1)
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("[v0] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.")
  process.exit(1)
}

// Parent -> child insert order so FK constraints are satisfied on upsert.
const ORDER = [
  "settings", "doc_counters", "role_permissions", "permission_overrides",
  "suppliers", "inventory_items", "customers", "profiles", "vehicles", "jobs",
  "leads", "appointments", "quotations", "quotation_items", "invoices",
  "invoice_items", "payments", "purchase_orders", "purchase_order_items",
  "stock_movements", "parts_requests", "vehicle_photos", "diagnostic_sessions",
  "diagnostic_tests", "approval_requests", "approval_item_decisions",
  "customer_portal_tokens", "notifications", "audit_logs", "website_events",
]

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function main() {
  const dir = join(process.cwd(), folder)
  const files = new Set(await readdir(dir))

  for (const table of ORDER) {
    const file = `${table}.json`
    if (!files.has(file)) continue
    const rows = JSON.parse(await readFile(join(dir, file), "utf8"))
    if (!Array.isArray(rows) || rows.length === 0) {
      console.log(`[v0] ${table}: 0 rows (skipped)`)
      continue
    }
    if (replace) {
      const { error: delErr } = await supabase.from(table).delete().not("id", "is", null)
      if (delErr) console.warn(`[v0] ${table}: clear warning: ${delErr.message}`)
    }
    // Upsert in chunks to stay within payload limits.
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      const { error } = await supabase.from(table).upsert(chunk)
      if (error) {
        console.error(`[v0] FAILED ${table} chunk ${i}: ${error.message}`)
        break
      }
    }
    console.log(`[v0] ${table}: restored ${rows.length} rows`)
  }
  console.log("\n[v0] Restore complete.")
}

main().catch((err) => {
  console.error("[v0] Restore failed:", err)
  process.exit(1)
})
