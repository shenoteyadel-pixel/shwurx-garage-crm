"use client"

import { assignedMediaIds, mediaStatus, MEDIA_STATUS_LABEL } from "@/lib/website/media-usage"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  History,
  Loader2,
  Plus,
  Rocket,
  Save,
  Trash2,
  Upload,
} from "lucide-react"
import { Badge, Button, Card, Label } from "@/components/ui"
import {
  exportWebsiteBackup,
  initialiseWebsite,
  publishWebsite,
  restoreRevisionToDraft,
  rollbackToRevision,
  saveWebsiteDraft,
  setWebsitePreview,
  uploadWebsiteMedia,
  validateWebsiteDraft,
} from "@/lib/actions-website-cms"
import type { EditorState } from "@/lib/website/store"
import type { ValidationIssue } from "@/lib/website/normalize"
import type { CustomPage, HomeSectionKey, MediaApproval, NavLink, PageBlock, WebsiteDocument } from "@/lib/website/types"
import {
  FaqEditor,
  L10nField,
  ListEditor,
  MediaPicker,
  MediaMultiPicker,
  SeoEditor,
  TextField,
  TextItemsEditor,
  Toggle,
  emptyL10n,
  uid,
} from "./fields"
import { AnalyticsSection } from "./analytics-section"
import { TeamSection } from "./team-section"
import { AppointmentPageSection, AppointmentFormSection } from "./appointment-section"

export type BuilderSection =
  | "business"
  | "pages"
  | "team"
  | "brands"
  | "services"
  | "custom"
  | "nav"
  | "form"
  | "seo"
  | "media"
  | "analytics"
  | "history"
type Section = BuilderSection

/** Lets the Website overview jump straight to a section (and optionally start a new team member). */
export type BuilderOpenRequest = { section: BuilderSection; recordId?: string; addTeamMember?: boolean; nonce: number }

const SECTIONS: { key: Section; label: string }[] = [
  { key: "business", label: "Business" },
  { key: "pages", label: "Home & pages" },
  { key: "team", label: "Team" },
  { key: "brands", label: "Brands" },
  { key: "services", label: "Services" },
  { key: "custom", label: "Custom pages" },
  { key: "nav", label: "Navigation" },
  { key: "form", label: "Forms" },
  { key: "seo", label: "SEO" },
  { key: "media", label: "Media" },
  { key: "history", label: "History" },
]

const emptySeo = () => ({ title: emptyL10n(), description: emptyL10n(), ogImageId: null, noindex: false })

export function WebsiteBuilder({ state, open }: { state: EditorState; open?: BuilderOpenRequest | null }) {
  const editCount = useRef(0)
  const router = useRouter()
  const [doc, setDoc] = useState<WebsiteDocument>(state.draft)
  const [version, setVersion] = useState(state.draftVersion)
  const [dirty, setDirty] = useState(false)
  const [section, setSection] = useState<Section>(open?.section ?? "business")
  const [handledOpen, setHandledOpen] = useState<number | null>(open?.nonce ?? null)
  const [pendingTeamAdd, setPendingTeamAdd] = useState<number | null>(open?.addTeamMember ? open.nonce : null)
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(
    open?.recordId ? { id: open.recordId, nonce: open.nonce } : null,
  )
  if (open && open.nonce !== handledOpen) {
    setHandledOpen(open.nonce)
    setSection(open.section)
    setFocus(open.recordId ? { id: open.recordId, nonce: open.nonce } : null)
    if (open.addTeamMember) setPendingTeamAdd(open.nonce)
  }
  // Scrolling to the opened record is a DOM side effect of the jump, not data fetching.
  useEffect(() => {
    if (!focus) return
    const frame = requestAnimationFrame(() => {
      document
        .querySelector(`[data-record="${CSS.escape(focus.id)}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
    return () => cancelAnimationFrame(frame)
  }, [focus])
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null)
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null)
  const [pending, start] = useTransition()
  const [note, setNote] = useState("")
  const [syncedFrom, setSyncedFrom] = useState({ draft: state.draft, version: state.draftVersion })

  // The builder stays mounted across router.refresh() (e.g. after Import), so
  // adopt the server's latest draft/version instead of keeping stale state.
  if (syncedFrom.draft !== state.draft || syncedFrom.version !== state.draftVersion) {
    setSyncedFrom({ draft: state.draft, version: state.draftVersion })
    if (!dirty) {
      setDoc(state.draft)
      setVersion(state.draftVersion)
    }
  }

  const mutate = (fn: (d: WebsiteDocument) => void) => {
    setDoc((prev) => {
      const next = structuredClone(prev)
      fn(next)
      return next
    })
    editCount.current += 1
    setDirty(true)
  }

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setMessage(null)
      try {
        await fn()
      } catch (e) {
        setMessage({ tone: "error", text: e instanceof Error ? e.message : "Something went wrong." })
      }
    })

  if (!state.available) {
    return (
      <Card className="flex items-start gap-3 p-5">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-semibold">Website storage is not set up yet</p>
          <p className="leading-relaxed text-muted-foreground">
            The public site is running on the built-in content. Once the database migration
            (scripts/050_website_cms.sql) is applied, you can edit and publish everything here.
          </p>
        </div>
      </Card>
    )
  }

  if (!state.initialised) {
    return (
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <p className="font-semibold">Start the site builder</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This imports the current website — all brands, services, your existing text edits and images — into an
            editable draft. Nothing changes on the live site until you publish.
          </p>
        </div>
        {message && <p className="text-sm text-destructive">{message.text}</p>}
        <Button
          className="self-start"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const r = await initialiseWebsite()
              if (!r.ok) return setMessage({ tone: "error", text: r.error })
              router.refresh()
            })
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Import current website
        </Button>
      </Card>
    )
  }

  const save = async (): Promise<number | null> => {
    const sentAt = editCount.current
    const r = await saveWebsiteDraft(doc, version)
    if (!r.ok) {
      if (r.issues) setIssues(r.issues)
      setMessage({
        tone: "error",
        text:
          r.currentVersion !== undefined
            ? "Someone else saved the draft since you opened it. Reload the page to get their changes before saving."
            : r.error,
      })
      return null
    }
    setVersion(r.version)
    // Edits typed while the request was in flight were not sent; keep them unsaved.
    setDirty(editCount.current !== sentAt)
    // Refresh the server DTO so the Overview's version and inventory follow the save.
    // Client state survives a refresh, so other editors' unsaved changes are kept.
    router.refresh()
    return r.version
  }

  const errors = issues?.filter((i) => i.level === "error") ?? []

  return (
    <div className="flex flex-col gap-5">
      <Card className="sticky top-2 z-10 flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge>Draft v{version}</Badge>
          {dirty ? (
            <Badge className="bg-amber-500/15 text-amber-600">Unsaved changes</Badge>
          ) : state.hasUnpublished ? (
            <Badge className="bg-amber-500/15 text-amber-600">Saved, not published</Badge>
          ) : (
            <Badge className="bg-primary/15 text-primary">Live matches draft</Badge>
          )}
          {state.updatedByName && (
            <span className="text-xs text-muted-foreground">Last saved by {state.updatedByName}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !dirty}
            onClick={() =>
              run(async () => {
                if (await save()) setMessage({ tone: "ok", text: "Draft saved." })
              })
            }
          >
            <Save className="h-4 w-4" /> Save draft
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const list = await validateWebsiteDraft(doc)
                setIssues(list)
                setMessage({ tone: "ok", text: list.length ? `${list.length} item(s) to review.` : "No problems found." })
              })
            }
          >
            <CheckCircle2 className="h-4 w-4" /> Check
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(async () => {
                if (dirty && !(await save())) return
                const r = await setWebsitePreview("draft")
                if (!r.ok) return setMessage({ tone: "error", text: r.error })
                window.open("/", "_blank", "noopener")
              })
            }
          >
            <Eye className="h-4 w-4" /> Preview draft
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              run(async () => {
                await setWebsitePreview("off")
                setMessage({ tone: "ok", text: "Preview mode turned off." })
              })
            }
          >
            <EyeOff className="h-4 w-4" /> End preview
          </Button>
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="publish-note">What changed? (optional)</Label>
            <input
              id="publish-note"
              className="h-10 rounded-lg border border-input bg-background/60 px-3 text-sm"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Updated Porsche FAQs"
            />
          </div>
          <Button
            disabled={pending}
            onClick={() =>
              run(async () => {
                let v = version
                if (dirty) {
                  const saved = await save()
                  if (!saved) return
                  v = saved
                }
                const r = await publishWebsite(v, note)
                if (!r.ok) {
                  if (r.issues) setIssues(r.issues)
                  return setMessage({ tone: "error", text: r.error })
                }
                setNote("")
                setIssues(null)
                setMessage({ tone: "ok", text: "Published. The live website is updated." })
                router.refresh()
              })
            }
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Publish
          </Button>
        </div>
        {message && (
          <p role="status" className={message.tone === "ok" ? "text-sm text-primary" : "text-sm text-destructive"}>
            {message.text}
          </p>
        )}
        {issues && issues.length > 0 && (
          <ul className="flex max-h-40 flex-col gap-1 overflow-auto rounded-lg bg-muted/40 p-3 text-xs">
            {issues.map((i, n) => (
              <li key={n} className={i.level === "error" ? "text-destructive" : "text-muted-foreground"}>
                <span className="font-semibold">{i.level === "error" ? "Must fix" : "Suggestion"}:</span> {i.message}
              </li>
            ))}
          </ul>
        )}
        {errors.length > 0 && <p className="text-xs text-destructive">Publishing is blocked until the items above are fixed.</p>}
      </Card>

      <nav aria-label="Website sections" className="flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSection(s.key)}
            aria-current={section === s.key ? "page" : undefined}
            className={
              "rounded-full px-3 py-1.5 text-xs font-medium transition " +
              (section === s.key ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground")
            }
          >
            {s.label}
          </button>
        ))}
      </nav>

      <Card className="flex flex-col gap-5 p-5">
        {section === "business" && <BusinessSection doc={doc} mutate={mutate} />}
        {section === "pages" && <PagesSection doc={doc} mutate={mutate} />}
        {section === "team" && (
          <TeamSection
            doc={doc}
            mutate={mutate}
            addRequest={pendingTeamAdd}
            onAddHandled={(nonce) => setPendingTeamAdd((cur) => (cur === nonce ? null : cur))}
          />
        )}
        {section === "brands" && <BrandsSection key={focus?.nonce ?? "brands"} doc={doc} mutate={mutate} focusId={focus?.id} />}
        {section === "services" && <ServicesSection key={focus?.nonce ?? "services"} doc={doc} mutate={mutate} focusId={focus?.id} />}
        {section === "custom" && <CustomPagesSection doc={doc} mutate={mutate} />}
        {section === "nav" && <NavSection doc={doc} mutate={mutate} />}
        {section === "form" && <FormSection doc={doc} mutate={mutate} />}
        {section === "seo" && <SeoSection doc={doc} mutate={mutate} />}
        {section === "media" && <MediaSection doc={doc} mutate={mutate} liveIds={state.liveMediaIds} />}
        {section === "history" && (
          <HistorySection
            state={state}
            pending={pending}
            onRestore={(id) =>
              run(async () => {
                if (dirty && !confirm("Discard your unsaved changes and load this version into the draft?")) return
                const r = await restoreRevisionToDraft(id, version)
                if (!r.ok) return setMessage({ tone: "error", text: r.error })
                setMessage({ tone: "ok", text: "Version loaded into the draft. Review it, then publish." })
                window.location.reload()
              })
            }
            onRollback={(id) =>
              run(async () => {
                if (!confirm("Make this version live immediately? Your draft is kept.")) return
                const r = await rollbackToRevision(id)
                if (!r.ok) return setMessage({ tone: "error", text: r.error })
                setMessage({ tone: "ok", text: "The live website now uses that version." })
                router.refresh()
              })
            }
            onExport={() =>
              run(async () => {
                const r = await exportWebsiteBackup()
                if (!r.ok) return setMessage({ tone: "error", text: r.error })
                const url = URL.createObjectURL(new Blob([r.json], { type: "application/json" }))
                const a = document.createElement("a")
                a.href = url
                a.download = `website-backup-${new Date().toISOString().slice(0, 10)}.json`
                a.click()
                URL.revokeObjectURL(url)
              })
            }
          />
        )}
      </Card>
    </div>
  )
}

type SectionProps = { doc: WebsiteDocument; mutate: (fn: (d: WebsiteDocument) => void) => void }

function SectionTitle({ title, intro, record }: { title: string; intro?: string; record?: string }) {
  return (
    <div className="flex scroll-mt-24 flex-col gap-1" data-record={record}>
      <h3 className="text-lg font-semibold">{title}</h3>
      {intro && <p className="text-sm leading-relaxed text-muted-foreground">{intro}</p>}
    </div>
  )
}

/* -------------------------------- Business -------------------------------- */

function BusinessSection({ doc, mutate }: SectionProps) {
  const b = doc.business
  return (
    <>
      <SectionTitle title="Business details" intro="Shown in the header, footer, contact page and Google listing data. Leave hours empty if not confirmed." />
      <L10nField label="Business name" value={b.name} onChange={(v) => mutate((d) => void (d.business.name = v))} />
      <L10nField
        label="Identity statement (home + about; facts only — leave empty to hide)"
        value={b.identity}
        onChange={(v) => mutate((d) => void (d.business.identity = v))}
        multiline
      />
      <div className="grid gap-4 md:grid-cols-3">
        <TextField label="Phone" value={b.phone} onChange={(v) => mutate((d) => void (d.business.phone = v))} placeholder="+971..." />
        <TextField label="WhatsApp" value={b.whatsapp} onChange={(v) => mutate((d) => void (d.business.whatsapp = v))} placeholder="+971..." />
        <TextField label="Email" type="email" value={b.email} onChange={(v) => mutate((d) => void (d.business.email = v))} />
      </div>
      <L10nField label="Address" value={b.address} onChange={(v) => mutate((d) => void (d.business.address = v))} multiline />
      <L10nField label="Area" value={b.area} onChange={(v) => mutate((d) => void (d.business.area = v))} />
      <TextField label="Google Maps link" value={b.mapUrl} onChange={(v) => mutate((d) => void (d.business.mapUrl = v))} />
      <L10nField label="Opening hours" value={b.hours} onChange={(v) => mutate((d) => void (d.business.hours = v))} multiline />
      <MediaPicker label="Logo" media={doc.media} value={b.logoId} onChange={(v) => mutate((d) => void (d.business.logoId = v))} />
      <ListEditor
        title="Social links"
        items={b.socials}
        onChange={(v) => mutate((d) => void (d.business.socials = v))}
        create={() => ({ id: uid("soc"), label: "", url: "" })}
        render={(s, up) => (
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="Label" value={s.label} onChange={(label) => up({ ...s, label })} placeholder="Instagram" />
            <TextField label="URL" value={s.url} onChange={(url) => up({ ...s, url })} placeholder="https://" />
          </div>
        )}
      />
    </>
  )
}

/* ---------------------------------- Pages --------------------------------- */

const HOME_SECTION_LABELS: Record<HomeSectionKey, string> = {
  hero: "Hero (headings above)",
  brands: "Brand pathways",
  services: "Services overview",
  process: "Process & about",
  team: "Team preview",
  blog: "Latest articles (only shown when published posts exist)",
  location: "Contact & location",
}

function HomeSectionsEditor({ doc, mutate }: SectionProps) {
  const sections = doc.pages.home.sections
  const move = (i: number, dir: -1 | 1) =>
    mutate((d) => {
      const list = d.pages.home.sections
      const j = i + dir
      if (j < 0 || j >= list.length) return
      ;[list[i], list[j]] = [list[j], list[i]]
    })
  return (
    <div className="flex flex-col gap-3">
      <Label>Home page bands (order, visibility, headings)</Label>
      <ol className="flex flex-col gap-3">
        {sections.map((s, i) => (
          <li key={s.key} className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-semibold">
                {i + 1}. {HOME_SECTION_LABELS[s.key]}
              </span>
              <div className="flex items-center gap-2">
                <Toggle label="Shown" checked={s.visible} onChange={(v) => mutate((d) => void (d.pages.home.sections[i].visible = v))} />
                <Button type="button" size="icon" variant="outline" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${s.key} up`}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => move(i, 1)}
                  disabled={i === sections.length - 1}
                  aria-label={`Move ${s.key} down`}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {s.key !== "hero" && (
              <>
                <L10nField label="Heading" value={s.heading} onChange={(v) => mutate((d) => void (d.pages.home.sections[i].heading = v))} />
                <L10nField label="Intro" value={s.intro} onChange={(v) => mutate((d) => void (d.pages.home.sections[i].intro = v))} multiline />
              </>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

function PagesSection({ doc, mutate }: SectionProps) {
  const p = doc.pages
  return (
    <>
      <SectionTitle title="Home page" record="home" />
      <L10nField label="Small heading" value={p.home.eyebrow} onChange={(v) => mutate((d) => void (d.pages.home.eyebrow = v))} />
      <L10nField label="Main heading" value={p.home.title} onChange={(v) => mutate((d) => void (d.pages.home.title = v))} />
      <L10nField label="Subtitle" value={p.home.subtitle} onChange={(v) => mutate((d) => void (d.pages.home.subtitle = v))} multiline />
      <MediaPicker label="Hero image" media={doc.media} value={p.home.heroImageId} onChange={(v) => mutate((d) => void (d.pages.home.heroImageId = v))} />
      {(["primaryCta", "secondaryCta"] as const).map((k) => (
        <div key={k} className="grid gap-3 md:grid-cols-2">
          <L10nField
            label={k === "primaryCta" ? "Main button label" : "Second button label"}
            value={p.home[k].label}
            onChange={(v) => mutate((d) => void (d.pages.home[k].label = v))}
          />
          <TextField
            label="Button link (site path, e.g. /contact)"
            value={p.home[k].href}
            onChange={(v) => mutate((d) => void (d.pages.home[k].href = v))}
            placeholder="/contact"
          />
        </div>
      ))}
      <TextItemsEditor
        title="Hero proof points (facts only)"
        items={p.home.highlights}
        onChange={(v) => mutate((d) => void (d.pages.home.highlights = v))}
      />
      <HomeSectionsEditor doc={doc} mutate={mutate} />
      <SeoEditor value={p.home.seo} media={doc.media} onChange={(v) => mutate((d) => void (d.pages.home.seo = v))} />

      <TextItemsEditor title="Our process (inspection → quote → approval)" items={p.process} onChange={(v) => mutate((d) => void (d.pages.process = v))} />
      <AppointmentPageSection doc={doc} mutate={mutate} />

      {(["about", "privacy"] as const).map((key) => (
        <div key={key} className="flex flex-col gap-4 border-t border-border pt-5">
          <SectionTitle title={key === "about" ? "About page" : "Privacy page"} record={key} />
          <L10nField label="Title" value={p[key].title} onChange={(v) => mutate((d) => void (d.pages[key].title = v))} />
          <L10nField label="Text" value={p[key].body} onChange={(v) => mutate((d) => void (d.pages[key].body = v))} multiline />
          {key === "about" && (
            <MediaPicker label="About image" media={doc.media} value={p.about.imageId} onChange={(v) => mutate((d) => void (d.pages.about.imageId = v))} />
          )}
          <SeoEditor value={p[key].seo} media={doc.media} onChange={(v) => mutate((d) => void (d.pages[key].seo = v))} />
        </div>
      ))}
      {(["contact", "brandsIndex", "servicesIndex"] as const).map((key) => (
        <div key={key} className="flex flex-col gap-4 border-t border-border pt-5">
          <SectionTitle title={{ contact: "Contact page", brandsIndex: "Brands directory", servicesIndex: "Services directory" }[key]} record={key} />
          <L10nField label="Title" value={p[key].title} onChange={(v) => mutate((d) => void (d.pages[key].title = v))} />
          <L10nField label="Intro" value={p[key].intro} onChange={(v) => mutate((d) => void (d.pages[key].intro = v))} multiline />
          <SeoEditor value={p[key].seo} media={doc.media} onChange={(v) => mutate((d) => void (d.pages[key].seo = v))} />
        </div>
      ))}
    </>
  )
}

/* --------------------------------- Brands --------------------------------- */

function BrandsSection({ doc, mutate, focusId }: SectionProps & { focusId?: string }) {
  const [sel, setSel] = useState(
    focusId && doc.brands.some((b) => b.id === focusId) ? focusId : (doc.brands[0]?.id ?? ""),
  )
  const i = doc.brands.findIndex((b) => b.id === sel)
  const b = doc.brands[i]
  const set = (fn: (x: (typeof doc.brands)[number]) => void) => mutate((d) => fn(d.brands[i]))
  return (
    <>
      <SectionTitle title="Brand pages" intro="Each brand has its own page in English and Arabic. Capability statements should stay honest — every vehicle is assessed first." />
      <div className="flex flex-wrap gap-1.5">
        {doc.brands.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setSel(x.id)}
            className={
              "rounded-md border px-2.5 py-1 text-xs " +
              (x.id === sel ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground") +
              (x.visible ? "" : " opacity-50")
            }
          >
            {x.name.en}
          </button>
        ))}
      </div>
      {b && (
        <div key={b.id} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <a href={`/brands/${b.slug}`} target="_blank" rel="noopener" className="text-xs text-primary underline">
              /brands/{b.slug}
            </a>
            <Toggle label="Visible on website" checked={b.visible} onChange={(v) => set((x) => void (x.visible = v))} />
          </div>
          <L10nField label="Name" value={b.name} onChange={(v) => set((x) => void (x.name = v))} />
          <L10nField label="Introduction" value={b.intro} onChange={(v) => set((x) => void (x.intro = v))} multiline />
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Models from year"
              type="number"
              value={String(b.yearFrom)}
              onChange={(v) => set((x) => void (x.yearFrom = Number(v) || x.yearFrom))}
            />
            <MediaPicker label="Logo" media={doc.media} value={b.logoId} onChange={(v) => set((x) => void (x.logoId = v))} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Services offered for this brand</Label>
            <div className="flex flex-wrap gap-4">
              {doc.services.map((s) => (
                <Toggle
                  key={s.slug}
                  label={s.name.en}
                  checked={b.serviceSlugs.includes(s.slug)}
                  onChange={(on) =>
                    set((x) => void (x.serviceSlugs = on ? [...x.serviceSlugs, s.slug] : x.serviceSlugs.filter((y) => y !== s.slug)))
                  }
                />
              ))}
            </div>
          </div>
          <ListEditor
            title="Models covered"
            items={b.models}
            onChange={(v) => set((x) => void (x.models = v))}
            create={() => ({ id: uid("mdl"), name: "", yearFrom: b.yearFrom, yearTo: null, note: emptyL10n() })}
            render={(m, up) => (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <TextField label="Model" value={m.name} onChange={(name) => up({ ...m, name })} />
                  <TextField label="From" type="number" value={String(m.yearFrom)} onChange={(v) => up({ ...m, yearFrom: Number(v) || m.yearFrom })} />
                  <TextField
                    label="To (empty = current)"
                    type="number"
                    value={m.yearTo === null ? "" : String(m.yearTo)}
                    onChange={(v) => up({ ...m, yearTo: v ? Number(v) : null })}
                  />
                </div>
                <L10nField label="Note" value={m.note} onChange={(note) => up({ ...m, note })} />
              </>
            )}
          />
          <TextItemsEditor title="Brand knowledge" items={b.knowledge} onChange={(v) => set((x) => void (x.knowledge = v))} />
          <MediaMultiPicker label="Workshop gallery" media={doc.media} value={b.galleryIds} onChange={(v) => set((x) => void (x.galleryIds = v))} />
          <FaqEditor items={b.faqs} onChange={(v) => set((x) => void (x.faqs = v))} />
          <ListEditor
            title="Documented case studies"
            items={b.caseStudies}
            onChange={(v) => set((x) => void (x.caseStudies = v))}
            create={() => ({ id: uid("case"), title: emptyL10n(), body: emptyL10n(), mediaIds: [], documented: false })}
            render={(c, up) => (
              <>
                <L10nField label="Title" value={c.title} onChange={(title) => up({ ...c, title })} />
                <L10nField label="Write-up" value={c.body} onChange={(body) => up({ ...c, body })} multiline />
                <MediaMultiPicker label="Job photos" media={doc.media} value={c.mediaIds} onChange={(mediaIds) => up({ ...c, mediaIds })} />
                <Toggle
                  label="I confirm this job happened and customer details are removed (required to show it)"
                  checked={c.documented}
                  onChange={(documented) => up({ ...c, documented })}
                />
              </>
            )}
          />
          <SeoEditor value={b.seo} media={doc.media} onChange={(v) => set((x) => void (x.seo = v))} />
        </div>
      )}
    </>
  )
}

/* -------------------------------- Services -------------------------------- */

function ServicesSection({ doc, mutate, focusId }: SectionProps & { focusId?: string }) {
  const [sel, setSel] = useState(
    focusId && doc.services.some((x) => x.id === focusId) ? focusId : (doc.services[0]?.id ?? ""),
  )
  const i = doc.services.findIndex((s) => s.id === sel)
  const s = doc.services[i]
  const set = (fn: (x: (typeof doc.services)[number]) => void) => mutate((d) => fn(d.services[i]))
  return (
    <>
      <SectionTitle title="Service pages" />
      <div className="flex flex-wrap gap-1.5">
        {doc.services.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setSel(x.id)}
            className={
              "rounded-md border px-2.5 py-1 text-xs " +
              (x.id === sel ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground") +
              (x.visible ? "" : " opacity-50")
            }
          >
            {x.name.en}
          </button>
        ))}
      </div>
      {s && (
        <div key={s.id} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <a href={`/services/${s.slug}`} target="_blank" rel="noopener" className="text-xs text-primary underline">
              /services/{s.slug}
            </a>
            <Toggle label="Visible on website" checked={s.visible} onChange={(v) => set((x) => void (x.visible = v))} />
          </div>
          <L10nField label="Name" value={s.name} onChange={(v) => set((x) => void (x.name = v))} />
          <L10nField label="Short summary" value={s.summary} onChange={(v) => set((x) => void (x.summary = v))} />
          <L10nField label="Introduction" value={s.intro} onChange={(v) => set((x) => void (x.intro = v))} multiline />
          <L10nField
            label="Scope note"
            value={s.scopeNote}
            onChange={(v) => set((x) => void (x.scopeNote = v))}
            multiline
            hint="Keeps the page honest, e.g. capability depends on assessment."
          />
          <L10nField label="Before your visit" value={s.preparation} onChange={(v) => set((x) => void (x.preparation = v))} multiline />
          <TextItemsEditor title="What we do" items={s.subservices} onChange={(v) => set((x) => void (x.subservices = v))} />
          <TextItemsEditor title="Steps" items={s.steps} onChange={(v) => set((x) => void (x.steps = v))} />
          <FaqEditor items={s.faqs} onChange={(v) => set((x) => void (x.faqs = v))} />
          <MediaMultiPicker label="Workshop gallery" media={doc.media} value={s.galleryIds} onChange={(v) => set((x) => void (x.galleryIds = v))} />
          <SeoEditor value={s.seo} media={doc.media} onChange={(v) => set((x) => void (x.seo = v))} />
        </div>
      )}
    </>
  )
}

/* ------------------------------ Custom pages ------------------------------ */

function blockLabel(t: PageBlock["type"]) {
  return { text: "Text", faq: "FAQ", gallery: "Gallery", cta: "Call to action" }[t]
}

function CustomPagesSection({ doc, mutate }: SectionProps) {
  const create = (): CustomPage => ({
    id: uid("page"),
    slug: `new-page-${doc.pages.custom.length + 1}`,
    template: "standard",
    title: emptyL10n(),
    intro: emptyL10n(),
    blocks: [],
    seo: emptySeo(),
    visible: false,
    brandSlug: null,
    serviceSlug: null,
  })
  return (
    <>
      <SectionTitle title="Custom & landing pages" intro="Pages live at /pages/your-slug. New pages start hidden — switch them on when ready." />
      <ListEditor
        title="Pages"
        addLabel="Add page"
        items={doc.pages.custom}
        onChange={(v) => mutate((d) => void (d.pages.custom = v))}
        create={create}
        render={(p, up) => (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <TextField
                label="Address (slug)"
                value={p.slug}
                onChange={(slug) => up({ ...p, slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
                hint={`/pages/${p.slug}`}
              />
              <div className="flex flex-col gap-1.5">
                <Label>Prefill enquiry brand</Label>
                <select
                  className="h-10 rounded-lg border border-input bg-background/60 px-3 text-sm"
                  value={p.brandSlug ?? ""}
                  onChange={(e) => up({ ...p, brandSlug: e.target.value || null })}
                >
                  <option value="">None</option>
                  {doc.brands.map((b) => (
                    <option key={b.slug} value={b.slug}>
                      {b.name.en}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Prefill enquiry service</Label>
                <select
                  className="h-10 rounded-lg border border-input bg-background/60 px-3 text-sm"
                  value={p.serviceSlug ?? ""}
                  onChange={(e) => up({ ...p, serviceSlug: e.target.value || null })}
                >
                  <option value="">None</option>
                  {doc.services.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.name.en}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Toggle label="Visible on website" checked={p.visible} onChange={(visible) => up({ ...p, visible })} />
            <L10nField label="Title" value={p.title} onChange={(title) => up({ ...p, title })} />
            <L10nField label="Intro" value={p.intro} onChange={(intro) => up({ ...p, intro })} multiline />
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-semibold">Content blocks</h4>
                {(["text", "faq", "gallery", "cta"] as const).map((t) => (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const base = { id: uid("blk"), heading: emptyL10n() }
                      const block: PageBlock =
                        t === "faq"
                          ? { ...base, type: "faq", faqs: [] }
                          : t === "gallery"
                            ? { ...base, type: "gallery", mediaIds: [] }
                            : { ...base, type: t, body: emptyL10n() }
                      up({ ...p, blocks: [...p.blocks, block] })
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" /> {blockLabel(t)}
                  </Button>
                ))}
              </div>
              {p.blocks.map((blk) => {
                const upBlock = (next: PageBlock) => up({ ...p, blocks: p.blocks.map((x) => (x.id === blk.id ? next : x)) })
                return (
                  <div key={blk.id} className="flex flex-col gap-3 rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between">
                      <Badge>{blockLabel(blk.type)}</Badge>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Remove block"
                        onClick={() => up({ ...p, blocks: p.blocks.filter((x) => x.id !== blk.id) })}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <L10nField label="Heading" value={blk.heading} onChange={(heading) => upBlock({ ...blk, heading })} />
                    {(blk.type === "text" || blk.type === "cta") && (
                      <L10nField label="Text" value={blk.body} onChange={(body) => upBlock({ ...blk, body })} multiline />
                    )}
                    {blk.type === "faq" && <FaqEditor items={blk.faqs} onChange={(faqs) => upBlock({ ...blk, faqs })} />}
                    {blk.type === "gallery" && (
                      <div className="flex flex-wrap gap-3">
                        {doc.media.map((m) => (
                          <Toggle
                            key={m.id}
                            label={m.alt.en || m.id}
                            checked={blk.mediaIds.includes(m.id)}
                            onChange={(on) =>
                              upBlock({ ...blk, mediaIds: on ? [...blk.mediaIds, m.id] : blk.mediaIds.filter((x) => x !== m.id) })
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <SeoEditor value={p.seo} media={doc.media} onChange={(seo) => up({ ...p, seo })} />
          </>
        )}
      />
    </>
  )
}

/* ------------------------------- Navigation ------------------------------- */

function NavSection({ doc, mutate }: SectionProps) {
  const editor = (key: "header" | "footer", title: string) => (
    <ListEditor<NavLink>
      title={title}
      addLabel="Add link"
      items={doc.nav[key]}
      onChange={(v) => mutate((d) => void (d.nav[key] = v))}
      create={() => ({ id: uid("nav"), label: emptyL10n(), href: "/", visible: true })}
      render={(n, up) => (
        <>
          <L10nField label="Label" value={n.label} onChange={(label) => up({ ...n, label })} />
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-56 flex-1">
              <TextField label="Link" value={n.href} onChange={(href) => up({ ...n, href })} hint="Internal path like /brands — the Arabic version is added automatically." />
            </div>
            <Toggle label="Visible" checked={n.visible} onChange={(visible) => up({ ...n, visible })} />
          </div>
        </>
      )}
    />
  )
  return (
    <>
      <SectionTitle title="Navigation menus" />
      {editor("header", "Header menu")}
      {editor("footer", "Footer links")}
    </>
  )
}

/* ------------------------------ Enquiry form ------------------------------ */

function FormSection({ doc, mutate }: SectionProps) {
  const f = doc.forms.enquiry
  const labels = Object.keys(f.labels) as (keyof typeof f.labels)[]
  return (
    <>
      <SectionTitle title="Enquiry form" intro="Submissions arrive as leads in the CRM with the page, brand and service they came from." />
      <Toggle label="Show the enquiry form (call and WhatsApp stay visible either way)" checked={f.enabled} onChange={(v) => mutate((d) => void (d.forms.enquiry.enabled = v))} />
      <L10nField label="Heading" value={f.heading} onChange={(v) => mutate((d) => void (d.forms.enquiry.heading = v))} />
      <L10nField label="Intro" value={f.intro} onChange={(v) => mutate((d) => void (d.forms.enquiry.intro = v))} multiline />
      <div className="grid gap-4 md:grid-cols-2">
        {labels.map((k) => (
          <L10nField key={k} label={`Label: ${k}`} value={f.labels[k]} onChange={(v) => mutate((d) => void (d.forms.enquiry.labels[k] = v))} />
        ))}
      </div>
      <L10nField label="Privacy note" value={f.privacyNote} onChange={(v) => mutate((d) => void (d.forms.enquiry.privacyNote = v))} multiline />
      <L10nField label="Success title" value={f.successTitle} onChange={(v) => mutate((d) => void (d.forms.enquiry.successTitle = v))} />
      <L10nField label="Success message" value={f.successBody} onChange={(v) => mutate((d) => void (d.forms.enquiry.successBody = v))} multiline />
      <L10nField label="What happens next" value={f.nextSteps} onChange={(v) => mutate((d) => void (d.forms.enquiry.nextSteps = v))} multiline />
      <AppointmentFormSection doc={doc} mutate={mutate} />
    </>
  )
}

/* ---------------------------------- SEO ----------------------------------- */

function SeoSection({ doc, mutate }: SectionProps) {
  const s = doc.seo
  return (
    <>
      <SectionTitle title="Site-wide SEO" />
      <L10nField label="Site name" value={s.siteName} onChange={(v) => mutate((d) => void (d.seo.siteName = v))} />
      <L10nField label="Title suffix" value={s.titleSuffix} onChange={(v) => mutate((d) => void (d.seo.titleSuffix = v))} hint="Added after every page title, e.g. “ | SHWURX Dubai”." />
      <L10nField label="Default description" value={s.defaultDescription} onChange={(v) => mutate((d) => void (d.seo.defaultDescription = v))} multiline />
      <MediaPicker label="Default share image" media={doc.media} value={s.defaultOgImageId} onChange={(v) => mutate((d) => void (d.seo.defaultOgImageId = v))} />
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-4">
        <p className="text-sm font-medium">Redirects (not active)</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The live site does not apply redirects yet, so this list cannot be edited. Stored entries are kept unchanged.
        </p>
        {s.redirects.length > 0 && (
          <ul className="flex flex-col gap-1 font-mono text-xs text-muted-foreground">
            {s.redirects.map((r) => (
              <li key={r.id}>{`${r.from} → ${r.to}${r.permanent ? " (permanent)" : ""}`}</li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

/* ---------------------------------- Media --------------------------------- */

function MediaSection({ doc, mutate, liveIds }: SectionProps & { liveIds: string[] }) {
  const draftAssigned = assignedMediaIds(doc)
  const live = new Set(liveIds)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const sorted = useMemo(() => doc.media.slice().reverse(), [doc.media])

  const upload = async (file: File) => {
    setBusy(true)
    setErr(null)
    const fd = new FormData()
    fd.set("file", file)
    const r = await uploadWebsiteMedia(fd)
    setBusy(false)
    if (!r.ok) return setErr(r.error)
    mutate((d) => void d.media.push(r.asset))
  }

  return (
    <>
      <SectionTitle
        title="Media library"
        intro="Only images marked Approved and safe to show (no number plates or customers) appear on the website. Save the draft after uploading."
      />
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void upload(f)
            e.target.value = ""
          }}
        />
        <Button type="button" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload image
        </Button>
        {err && <p className="text-sm text-destructive">{err}</p>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {sorted.map((m) => {
          const i = doc.media.findIndex((x) => x.id === m.id)
          const set = (fn: (x: (typeof doc.media)[number]) => void) => mutate((d) => fn(d.media[i]))
          const status = mediaStatus(m, draftAssigned, live)
          return (
            <div key={m.id} className="flex flex-col gap-3 rounded-lg border border-border p-3">
              <div className="relative aspect-video overflow-hidden rounded-md bg-muted">
                <Image
                  src={m.url || "/placeholder.svg"}
                  alt={m.alt.en || "Website image"}
                  fill
                  sizes="(min-width: 768px) 360px, 100vw"
                  className="object-cover"
                  style={{ objectPosition: `${m.focalX}% ${m.focalY}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  className={
                    status === "live"
                      ? "bg-primary/15 text-primary"
                      : status === "hidden"
                        ? "bg-amber-500/15 text-amber-600"
                        : "bg-muted text-muted-foreground"
                  }
                >
                  {MEDIA_STATUS_LABEL[status]}
                </Badge>
                <span className="text-xs text-muted-foreground">{m.source.replace(/_/g, " ")}</span>
              </div>
              <L10nField label="Alt text (describe the image)" value={m.alt} onChange={(v) => set((x) => void (x.alt = v))} />
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Approval</Label>
                  <select
                    className="h-10 rounded-lg border border-input bg-background/60 px-3 text-sm"
                    value={m.approval}
                    onChange={(e) => set((x) => void (x.approval = e.target.value as MediaApproval))}
                  >
                    <option value="needs_review">Needs review</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
                <Toggle label="Safe to show publicly" checked={m.publicSafe} onChange={(v) => set((x) => void (x.publicSafe = v))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Focus left/right %"
                  type="number"
                  value={String(m.focalX)}
                  onChange={(v) => set((x) => void (x.focalX = Math.max(0, Math.min(100, Number(v) || 0))))}
                />
                <TextField
                  label="Focus top/bottom %"
                  type="number"
                  value={String(m.focalY)}
                  onChange={(v) => set((x) => void (x.focalY = Math.max(0, Math.min(100, Number(v) || 0))))}
                />
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

/* --------------------------------- History -------------------------------- */

function HistorySection({
  state,
  pending,
  onRestore,
  onRollback,
  onExport,
}: {
  state: EditorState
  pending: boolean
  onRestore: (id: number) => void
  onRollback: (id: number) => void
  onExport: () => void
}) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionTitle title="Version history" intro="Every publish is kept. Load an old version into the draft to edit it, or make it live straight away." />
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onExport}>
          <Download className="h-4 w-4" /> Download backup
        </Button>
      </div>
      {state.revisions.length === 0 && <p className="text-sm text-muted-foreground">Nothing published yet.</p>}
      <ul className="flex flex-col divide-y divide-border">
        {state.revisions.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex flex-col gap-0.5 text-sm">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">#{r.id}</span>
                <Badge>{r.kind}</Badge>
                {r.id === state.publishedRevisionId && <Badge className="bg-primary/15 text-primary">Live</Badge>}
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(r.createdAt).toLocaleString()} {r.createdByName ? `· ${r.createdByName}` : ""} {r.note ? `· ${r.note}` : ""}
              </span>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => onRestore(r.id)}>
                Load into draft
              </Button>
              {r.id !== state.publishedRevisionId && r.kind !== "backup" && (
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => onRollback(r.id)}>
                  Make live
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
