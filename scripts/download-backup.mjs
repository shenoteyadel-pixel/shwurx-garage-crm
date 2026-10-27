// Downloads a verified cloud backup (written by /api/cron/backup) into
// ./backups/<timestamp>/ in the format scripts/restore-database.mjs reads.
// Every file is checked against the manifest's SHA-256 before it is written.
//
// Usage:
//   node --env-file-if-exists=/vercel/share/.env.project scripts/download-backup.mjs [backup-folder]
//   (omit the folder to fetch the latest verified backup)

import { createHash } from "node:crypto"
import { gunzipSync } from "node:zlib"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { get, list } from "@vercel/blob"

const PREFIX = "db-backups/"

async function read(pathname) {
  const res = await get(pathname, { access: "private" })
  if (!res || res.statusCode !== 200) throw new Error(`Missing ${pathname}`)
  return Buffer.from(await new Response(res.stream).arrayBuffer())
}

async function latestManifest() {
  const manifests = []
  let cursor
  do {
    const page = await list({ prefix: PREFIX, cursor, limit: 1000 })
    manifests.push(...page.blobs.filter((b) => b.pathname.endsWith("/_manifest.json")).map((b) => b.pathname))
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  if (!manifests.length) throw new Error("No verified cloud backups found")
  return manifests.sort().at(-1)
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN is not set")
  const arg = process.argv[2]
  const manifestPath = arg ? `${arg.replace(/\/$/, "")}/_manifest.json` : await latestManifest()
  const manifest = JSON.parse((await read(manifestPath)).toString("utf8"))
  if (manifest.verified !== true) throw new Error("Manifest is not marked verified")
  const stamp = manifestPath.slice(PREFIX.length).split("/")[0]
  const dir = join(process.cwd(), "backups", stamp)
  await mkdir(dir, { recursive: true })

  for (const t of manifest.tables) {
    const buf = await read(t.pathname)
    if (createHash("sha256").update(buf).digest("hex") !== t.sha256) throw new Error(`Checksum mismatch for ${t.table}`)
    const rows = JSON.parse(gunzipSync(buf).toString("utf8"))
    if (!Array.isArray(rows) || rows.length !== t.rows) throw new Error(`Row count mismatch for ${t.table}`)
    await writeFile(join(dir, `${t.table}.json`), JSON.stringify(rows, null, 2))
    console.log(`[v0] ${t.table}: ${rows.length} rows`)
  }
  await writeFile(
    join(dir, "_manifest.json"),
    JSON.stringify({ created_at: manifest.created_at, tables: Object.fromEntries(manifest.tables.map((t) => [t.table, t.rows])), total_rows: manifest.total_rows }, null, 2),
  )
  console.log(`\n[v0] Downloaded and verified ${manifest.tables.length} tables -> backups/${stamp}/`)
}

main().catch((err) => {
  console.error("[v0] Download failed:", err.message)
  process.exit(1)
})
