import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"

const url = process.env.SUPABASE_URL
const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const at = readFileSync("/tmp/at.txt", "utf8").trim()
const id = "c0b4b346-d132-470b-9a7f-dc3ddac9ee61"

const supabase = createClient(url, anon, {
  global: { headers: { Authorization: `Bearer ${at}` } },
  auth: { persistSession: false, autoRefreshToken: false },
})

function log(label, { data, error }) {
  console.log(`\n[${label}] error=`, error ? JSON.stringify(error) : "none")
  if (Array.isArray(data)) console.log(`  rows=${data.length}`, JSON.stringify(data).slice(0, 500))
  else console.log("  data=", JSON.stringify(data).slice(0, 500))
  return data
}

log("supplier_invoices", await supabase.from("supplier_invoices").select("*").eq("id", id).maybeSingle())
log("items", await supabase.from("supplier_invoice_items").select("*").eq("invoice_id", id).order("line_no"))
log("suppliers", await supabase.from("suppliers").select("id, name").is("deleted_at", null).order("name"))
log("inventory", await supabase.from("inventory_items").select("id, name, sku, cost_price, crm_part_id, oem_part_number, supplier_part_number").is("deleted_at", null).order("name"))
log("jobs", await supabase.from("jobs").select("id, job_number, vehicle_make, vehicle_model, plate_number, customer_name").order("created_at", { ascending: false }).limit(200))
log("settings", await supabase.from("settings").select("*").eq("id", 1).maybeSingle())
log("payments", await supabase.from("payments").select("id, amount, method, reference, paid_at").eq("supplier_invoice_id", id).order("paid_at", { ascending: false }))
log("linked seed items", await supabase.from("supplier_invoice_items").select("job_id").eq("invoice_id", id).not("job_id", "is", null))

console.log("\nDONE")
