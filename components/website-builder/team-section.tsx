"use client"

import { useEffect, useRef, useState } from "react"
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Copy, Eye, EyeOff, Plus } from "lucide-react"
import { Badge, Button, Label } from "@/components/ui"
import { isPublicTeamMember, isTeamPagePublic } from "@/lib/website/normalize"
import type { TeamMember, WebsiteDocument } from "@/lib/website/types"
import { L10nField, MediaPicker, SeoEditor, Toggle, emptyL10n, uid } from "./fields"

type Props = {
  doc: WebsiteDocument
  mutate: (fn: (d: WebsiteDocument) => void) => void
  /** set by the overview's "Add member" so the editor opens with a fresh draft */
  /** nonce of a pending Overview "Add team member" request */
  addRequest?: number | null
  onAddHandled?: (nonce: number) => void
}

export function memberStatus(m: TeamMember): { label: string; tone: "live" | "draft" | "hidden" | "archived" } {
  if (m.archived) return { label: "Archived", tone: "archived" }
  if (isPublicTeamMember(m)) return { label: "Public", tone: "live" }
  if (!m.visible) return { label: "Hidden draft", tone: "hidden" }
  return { label: "Incomplete", tone: "draft" }
}

function missingFields(m: TeamMember): string[] {
  const out: string[] = []
  if (!m.name.en.trim()) out.push("English name")
  if (!m.name.ar.trim()) out.push("Arabic name")
  if (!m.jobTitle.en.trim()) out.push("English job title")
  if (!m.jobTitle.ar.trim()) out.push("Arabic job title")
  return out
}

function renumber(list: TeamMember[]) {
  list.forEach((m, i) => (m.sortOrder = i))
}

export function newTeamMember(sortOrder: number): TeamMember {
  return {
    id: uid("team"),
    name: emptyL10n(),
    jobTitle: emptyL10n(),
    bio: emptyL10n(),
    department: emptyL10n(),
    photoId: null,
    visible: false,
    archived: false,
    sortOrder,
  }
}

export function TeamSection({ doc, mutate, addRequest, onAddHandled }: Props) {
  const page = doc.pages.team
  const ordered = [...page.members].sort((a, b) => a.sortOrder - b.sortOrder)
  const [showArchived, setShowArchived] = useState(false)
  const listed = ordered.filter((m) => showArchived || !m.archived)
  const [sel, setSel] = useState<string>(listed[0]?.id ?? "")
  const [focusId, setFocusId] = useState<string | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const selected = page.members.find((m) => m.id === sel)
  const publicCount = page.members.filter(isPublicTeamMember).length

  useEffect(() => {
    if (!focusId || focusId !== sel) return
    editorRef.current?.querySelector<HTMLInputElement>("input")?.focus()
    editorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    setFocusId(null)
  }, [focusId, sel])

  const withOrdered = (fn: (list: TeamMember[], d: WebsiteDocument) => void) =>
    mutate((d) => {
      const list = [...d.pages.team.members].sort((a, b) => a.sortOrder - b.sortOrder)
      fn(list, d)
      renumber(list)
      d.pages.team.members = list
    })

  const add = () => {
    const m = newTeamMember(page.members.length)
    withOrdered((list) => list.push(m))
    setSel(m.id)
    setFocusId(m.id)
  }

  // Each Overview "Add team member" carries a nonce; it is handled exactly once,
  // and the section is never remounted for it, so the new slot stays selected.
  const handledAdd = useRef<number | null>(null)
  useEffect(() => {
    if (addRequest == null || handledAdd.current === addRequest) return
    handledAdd.current = addRequest
    add()
    onAddHandled?.(addRequest)
    // add() is intentionally run once per request nonce
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addRequest])

  const duplicate = (id: string) => {
    const copy = { ...structuredClone(page.members.find((m) => m.id === id)!), id: uid("team"), visible: false, archived: false }
    withOrdered((list) => list.splice(list.findIndex((m) => m.id === id) + 1, 0, copy))
    setSel(copy.id)
    setFocusId(copy.id)
  }

  const move = (id: string, dir: -1 | 1) =>
    withOrdered((list) => {
      const visibleIdx = list.filter((m) => showArchived || !m.archived)
      const pos = visibleIdx.findIndex((m) => m.id === id)
      const target = visibleIdx[pos + dir]
      if (!target) return
      const a = list.findIndex((m) => m.id === id)
      const b = list.findIndex((m) => m.id === target.id)
      ;[list[a], list[b]] = [list[b], list[a]]
    })

  const update = (id: string, fn: (m: TeamMember) => void) =>
    mutate((d) => {
      const m = d.pages.team.members.find((x) => x.id === id)
      if (m) fn(m)
    })

  return (
    <>
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold">Team page</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Add real people only. A member appears on /team once they are marked visible and have a name and job title in both
          languages. Drafts are shown in preview only. Nothing here is linked to CRM staff or HR records.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
        <Toggle label="Team page switched on" checked={page.visible} onChange={(v) => mutate((d) => void (d.pages.team.visible = v))} />
        <span className="text-muted-foreground">
          {publicCount} public · {page.members.filter((m) => !m.archived).length} total
        </span>
        <Badge className={isTeamPagePublic(doc) ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}>
          {!isTeamPagePublic(doc)
            ? "Page and nav link hidden"
            : publicCount > 0
              ? "Page will be live when published"
              : "Page goes live with intro and contact invitation; no member cards yet"}
        </Badge>
      </div>

      <L10nField label="Page title" value={page.title} onChange={(v) => mutate((d) => void (d.pages.team.title = v))} />
      <L10nField label="Introduction" value={page.intro} onChange={(v) => mutate((d) => void (d.pages.team.intro = v))} multiline />

      <div className="grid gap-5 border-t border-border pt-5 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <Label>Members</Label>
            <Button type="button" size="sm" onClick={add}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add member
            </Button>
          </div>
          <Toggle label="Show archived" checked={showArchived} onChange={setShowArchived} />
          <ol className="flex max-h-[32rem] flex-col gap-1 overflow-y-auto" aria-label="Team members">
            {listed.map((m, i) => {
              const st = memberStatus(m)
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSel(m.id)}
                    aria-current={m.id === sel ? "true" : undefined}
                    className={
                      "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-start text-sm " +
                      (m.id === sel ? "border-primary bg-primary/10" : "border-border hover:bg-muted")
                    }
                  >
                    <span className="min-w-0 truncate">
                      <span className="me-2 text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
                      {m.name.en || m.name.ar || <span className="italic text-muted-foreground">Empty slot</span>}
                    </span>
                    <span
                      className={
                        "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium " +
                        (st.tone === "live" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")
                      }
                    >
                      {st.label}
                    </span>
                  </button>
                </li>
              )
            })}
            {listed.length === 0 && <li className="text-sm text-muted-foreground">No members yet.</li>}
          </ol>
        </div>

        {selected ? (
          <div ref={editorRef} key={selected.id} className="flex flex-col gap-4 rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => move(selected.id, -1)} aria-label="Move up">
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => move(selected.id, 1)} aria-label="Move down">
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => duplicate(selected.id)}>
                <Copy className="h-4 w-4" aria-hidden="true" /> Duplicate
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => update(selected.id, (m) => void (m.visible = !m.visible))}>
                {selected.visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                {selected.visible ? "Hide" : "Make visible"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => update(selected.id, (m) => void (m.archived = !m.archived))}>
                {selected.archived ? <ArchiveRestore className="h-4 w-4" aria-hidden="true" /> : <Archive className="h-4 w-4" aria-hidden="true" />}
                {selected.archived ? "Restore" : "Archive"}
              </Button>
              <span className="ms-auto text-xs text-muted-foreground">{memberStatus(selected).label}</span>
            </div>
            {selected.visible && !selected.archived && missingFields(selected).length > 0 && (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground" role="status">
                Not public yet. Missing: {missingFields(selected).join(", ")}.
              </p>
            )}
            <L10nField label="Name" value={selected.name} onChange={(v) => update(selected.id, (m) => void (m.name = v))} />
            <L10nField label="Job title" value={selected.jobTitle} onChange={(v) => update(selected.id, (m) => void (m.jobTitle = v))} />
            <L10nField label="Department (optional)" value={selected.department} onChange={(v) => update(selected.id, (m) => void (m.department = v))} />
            <L10nField label="Short bio (optional)" value={selected.bio} onChange={(v) => update(selected.id, (m) => void (m.bio = v))} multiline />
            <MediaPicker label="Portrait (4:5)" media={doc.media} value={selected.photoId} onChange={(v) => update(selected.id, (m) => void (m.photoId = v))} />
            <p className="text-xs text-muted-foreground">
              Upload portraits in Media, then set the English/Arabic description, focal point and approval there. Unapproved photos show initials instead.
            </p>
            <Toggle label="Visible on website" checked={selected.visible} onChange={(v) => update(selected.id, (m) => void (m.visible = v))} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Select a member, or add one.</p>
        )}
      </div>

      <div className="border-t border-border pt-5">
        <SeoEditor value={page.seo} media={doc.media} onChange={(v) => mutate((d) => void (d.pages.team.seo = v))} />
      </div>
    </>
  )
}
