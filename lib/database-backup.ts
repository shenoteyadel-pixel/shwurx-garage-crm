import "server-only"
import { createHash } from "node:crypto"
import { gunzipSync, gzipSync } from "node:zlib"
import { get, head, put } from "@vercel/blob"
import { createServiceClient } from "@/lib/supabase/server"

/** Blob prefix for database backups. Never served by /api/file and never deleted by the app. */
export const BACKUP_PREFIX = "db-backups/"
const PAGE_SIZE = 1000
const CONCURRENCY = 6

export interface TableResult {
  table: string
  rows: number
  bytes: number
  sha256: string
  pathname: string
  liveCountAtStart: number | null
}

export interface BackupManifest {
  format: "swurx-db-backup/v1"
  created_at: string
  completed_at: string
  verified: true
  tables: TableResult[]
  total_rows: number
  total_bytes: number
}

export interface BackupOutcome {
  ok: boolean
  manifestPathname: string | null
  tables: number
  totalRows: number
  totalBytes: number
  durationMs: number
  failures: { table: string; error: string }[]
  warnings: string[]
}

function supabaseRest() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Supabase service credentials are not configured")
  return { url: url.replace(/\/$/, ""), headers: { apikey: key, Authorization: `Bearer ${key}` } }
}

const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex")
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300)

/** Every table/view PostgREST exposes, with the columns usable for stable paging. */
async function discoverTables(): Promise<{ name: string; orderBy: string[] }[]> {
  const { url, headers } = supabaseRest()
  const res = await fetch(`${url}/rest/v1/`, { headers: { ...headers, Accept: "application/openapi+json" }, cache: "no-store" })
  if (!res.ok) throw new Error(`Schema discovery failed (HTTP ${res.status})`)
  const spec = (await res.json()) as { paths?: Record<string, unknown>; definitions?: Record<string, { properties?: Record<string, { description?: string }> }> }
  return Object.keys(spec.paths ?? {})
    .filter((p) => p !== "/" && !p.startsWith("/rpc/"))
    .map((p) => p.slice(1))
    .sort()
    .map((name) => {
      const props = spec.definitions?.[name]?.properties ?? {}
      const pk = Object.entries(props)
        .filter(([, v]) => (v.description ?? "").includes("<pk/>"))
        .map(([k]) => k)
      // Stable pagination needs a unique order; fall back to every column when there is no primary key.
      return { name, orderBy: pk.length ? pk : "id" in props ? ["id"] : Object.keys(props) }
    })
}

async function liveCount(table: string): Promise<number | null> {
  const { count, error } = await createServiceClient().from(table).select("*", { count: "exact", head: true })
  return error ? null : (count ?? 0)
}

async function exportTable(table: string, orderBy: string[]): Promise<unknown[]> {
  const svc = createServiceClient()
  const rows: unknown[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let q = svc.from(table).select("*").range(from, from + PAGE_SIZE - 1)
    for (const col of orderBy) q = q.order(col, { ascending: true })
    const { data, error } = await q
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) break
  }
  return rows
}

async function readBlob(pathname: string): Promise<Buffer> {
  const result = await get(pathname, { access: "private" })
  if (!result || result.statusCode !== 200 || !result.stream) throw new Error("not found in storage")
  return Buffer.from(await new Response(result.stream).arrayBuffer())
}

/** Re-downloads a stored table file and proves it is intact and restorable. */
async function verifyTable(t: TableResult): Promise<void> {
  const stored = await readBlob(t.pathname)
  if (sha256(stored) !== t.sha256) throw new Error("checksum mismatch after upload")
  const parsed = JSON.parse(gunzipSync(stored).toString("utf8")) as unknown
  if (!Array.isArray(parsed)) throw new Error("stored file is not a row array")
  if (parsed.length !== t.rows) throw new Error(`row count mismatch (${parsed.length} stored, ${t.rows} exported)`)
  if (parsed.some((r) => !r || typeof r !== "object")) throw new Error("stored file contains invalid rows")
}

async function pool<T>(items: T[], worker: (item: T) => Promise<void>) {
  const queue = [...items]
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await worker(item)
  }))
}

/**
 * Exports every table to private Blob storage under a new timestamped folder,
 * re-reads each file to verify it, and writes the manifest last. A backup is
 * only valid when its manifest exists. Existing backups are never touched.
 */
export async function runDatabaseBackup(): Promise<BackupOutcome> {
  const started = Date.now()
  const createdAt = new Date().toISOString()
  const folder = `${BACKUP_PREFIX}${createdAt.replace(/[:.]/g, "-")}`
  const failures: { table: string; error: string }[] = []
  const warnings: string[] = []
  const results: TableResult[] = []

  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("Backup storage (Vercel Blob) is not configured")
  const tables = await discoverTables()
  if (tables.length === 0) throw new Error("No tables discovered")

  await pool(tables, async ({ name, orderBy }) => {
    try {
      const before = await liveCount(name)
      const rows = await exportTable(name, orderBy)
      const body = gzipSync(Buffer.from(JSON.stringify(rows)))
      const result: TableResult = {
        table: name,
        rows: rows.length,
        bytes: body.length,
        sha256: sha256(body),
        pathname: `${folder}/${name}.json.gz`,
        liveCountAtStart: before,
      }
      await put(result.pathname, body, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: "application/gzip",
      })
      await verifyTable(result)
      if (before !== null && Math.abs(before - rows.length) > Math.max(5, before * 0.05)) {
        warnings.push(`${name}: ${rows.length} rows exported vs ${before} live at start`)
      }
      results.push(result)
    } catch (e) {
      failures.push({ table: name, error: errMsg(e) })
    }
  })

  results.sort((a, b) => a.table.localeCompare(b.table))
  const outcome: BackupOutcome = {
    ok: false,
    manifestPathname: null,
    tables: results.length,
    totalRows: results.reduce((s, r) => s + r.rows, 0),
    totalBytes: results.reduce((s, r) => s + r.bytes, 0),
    durationMs: 0,
    failures,
    warnings,
  }

  if (failures.length === 0) {
    const manifest: BackupManifest = {
      format: "swurx-db-backup/v1",
      created_at: createdAt,
      completed_at: new Date().toISOString(),
      verified: true,
      tables: results,
      total_rows: outcome.totalRows,
      total_bytes: outcome.totalBytes,
    }
    const pathname = `${folder}/_manifest.json`
    try {
      await put(pathname, JSON.stringify(manifest, null, 2), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: "application/json",
      })
      const stored = JSON.parse((await readBlob(pathname)).toString("utf8")) as BackupManifest
      if (stored.verified !== true || stored.tables.length !== results.length) throw new Error("manifest verification failed")
      outcome.ok = true
      outcome.manifestPathname = pathname
    } catch (e) {
      failures.push({ table: "_manifest", error: errMsg(e) })
    }
  }

  outcome.durationMs = Date.now() - started
  return outcome
}

/** Confirms a verified manifest still exists in storage. Used before a backup can count as Operational. */
export async function confirmBackupManifest(pathname: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof pathname !== "string" || !pathname.startsWith(BACKUP_PREFIX) || !pathname.endsWith("/_manifest.json")) {
    return { ok: false, error: "Backup run has no verified manifest" }
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { ok: false, error: "Backup storage (Vercel Blob) is not configured" }
  try {
    await head(pathname)
    return { ok: true }
  } catch {
    return { ok: false, error: "Backup manifest is missing from storage" }
  }
}
