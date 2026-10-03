"use client"

import { useMemo, useState } from "react"
import { Download, FileArchive, FileSpreadsheet } from "lucide-react"
import { Card, PrimaryButton, GhostButton } from "@/components/ui"
import type { ExportGroup } from "@/lib/data-export"

export function DataExportClient({ groups, counts }: { groups: ExportGroup[]; counts: Record<string, number> }) {
  const allTables = useMemo(() => groups.flatMap((g) => g.datasets.map((d) => d.table)), [groups])
  const [selected, setSelected] = useState<Set<string>>(() => new Set(allTables))

  const toggle = (table: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(table)) next.delete(table)
      else next.add(table)
      return next
    })

  const toggleGroup = (group: ExportGroup, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const d of group.datasets) on ? next.add(d.table) : next.delete(d.table)
      return next
    })

  const selectedList = allTables.filter((t) => selected.has(t))
  const selectedRows = selectedList.reduce((n, t) => n + (counts[t] ?? 0), 0)
  const zipHref = `/api/export?tables=${encodeURIComponent(selectedList.join(","))}`

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-balance">Download CRM Data</h1>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            Export your records as CSV files that open in Excel or Google Sheets. Choose datasets and download them
            together as a ZIP, or download any single table on its own. Owner only, and every export is logged.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GhostButton type="button" onClick={() => setSelected(new Set(allTables))}>
            Select all
          </GhostButton>
          <GhostButton type="button" onClick={() => setSelected(new Set())}>
            Clear
          </GhostButton>
          {selectedList.length > 0 ? (
            <a href={zipHref} download>
              <PrimaryButton type="button">
                <FileArchive className="size-4" aria-hidden="true" />
                Download {selectedList.length} as ZIP
              </PrimaryButton>
            </a>
          ) : (
            <PrimaryButton type="button" disabled>
              <FileArchive className="size-4" aria-hidden="true" />
              Select datasets
            </PrimaryButton>
          )}
        </div>
      </header>

      <p className="text-sm text-muted-foreground">
        {selectedList.length} of {allTables.length} datasets selected · {selectedRows.toLocaleString()} rows
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => {
          const allOn = group.datasets.every((d) => selected.has(d.table))
          return (
            <Card key={group.label} className="flex flex-col">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">{group.label}</h2>
                <button
                  type="button"
                  onClick={() => toggleGroup(group, !allOn)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {allOn ? "Unselect group" : "Select group"}
                </button>
              </div>
              <ul className="flex flex-col divide-y divide-border">
                {group.datasets.map((d) => {
                  const id = `export-${d.table}`
                  return (
                    <li key={d.table} className="flex items-center gap-3 px-4 py-2.5">
                      <input
                        id={id}
                        type="checkbox"
                        checked={selected.has(d.table)}
                        onChange={() => toggle(d.table)}
                        className="size-4 accent-primary"
                      />
                      <label htmlFor={id} className="flex flex-1 items-center gap-2 text-sm">
                        <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden="true" />
                        {d.label}
                      </label>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {(counts[d.table] ?? 0).toLocaleString()}
                      </span>
                      <a
                        href={`/api/export?tables=${d.table}`}
                        download
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Download className="size-4" aria-hidden="true" />
                        <span className="sr-only">Download {d.label} CSV</span>
                      </a>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
