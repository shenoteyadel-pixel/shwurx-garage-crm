"use client"

import { useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Card, Button, Input, Label, Textarea, Badge } from "@/components/ui"
import { uploadWebsiteImage } from "@/lib/actions-website"
import { saveArticle, importEditorialBriefs, importEditorialArticles, type ArticleIntent } from "@/lib/actions-articles"
import {
  emptyCopy,
  localeIssues,
  publishIssues,
  type Article,
  type ArticleLang,
  type ArticleSource,
  type ArticleWorkflow,
  type LocaleCopy,
} from "@/lib/article-model"
import type { ArticleTaxonomy } from "@/lib/website/control-center-data"
import { Loader2, Plus, Pencil, Trash2, Upload, Download, AlertTriangle, Check } from "lucide-react"
import { ReviewedArticleBatch } from "@/components/website-builder/reviewed-article-batch"

const WORKFLOW_LABEL: Record<ArticleWorkflow, string> = {
  brief: "Brief",
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
}

const newArticle = (): Article => ({
  id: "",
  key: null,
  slug: "",
  status: "draft",
  workflow: "draft",
  brandSlug: null,
  serviceSlugs: [],
  relatedKeys: [],
  coverUrl: null,
  coverIllustrative: false,
  content: { en: emptyCopy(), ar: emptyCopy() },
  sources: [],
  brief: null,
  reviewedBy: null,
  reviewedAt: null,
  author: null,
  publishedAt: null,
  updatedAt: "",
  revision: 1,
  legacy: false,
})

type Props = { posts: Article[]; taxonomy: ArticleTaxonomy; canManage: boolean; openPostId?: string }

export function ArticleManager({ posts, taxonomy, canManage, openPostId }: Props) {
  const [editing, setEditing] = useState<Article | null>(() =>
    canManage && openPostId ? (posts.find((p) => p.id === openPostId) ?? null) : null,
  )
  const [filter, setFilter] = useState<ArticleWorkflow | "published" | "all">("all")
  const [brand, setBrand] = useState("")
  const [q, setQ] = useState("")

  const brandName = useMemo(() => new Map(taxonomy.brands.map((b) => [b.slug, b.name])), [taxonomy.brands])

  const visible = posts.filter((p) => {
    if (filter === "published" && p.status !== "published") return false
    if (filter !== "all" && filter !== "published" && p.workflow !== filter) return false
    if (brand && p.brandSlug !== brand) return false
    if (q) {
      const hay = `${p.content.en.title} ${p.content.ar.title} ${p.slug}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    return true
  })

  if (editing) {
    return (
      <ArticleEditor
        key={editing.id || "new"}
        initial={editing}
        all={posts}
        taxonomy={taxonomy}
        canManage={canManage}
        onClose={() => setEditing(null)}
      />
    )
  }

  const counts = {
    all: posts.length,
    published: posts.filter((p) => p.status === "published").length,
    brief: posts.filter((p) => p.workflow === "brief").length,
    draft: posts.filter((p) => p.workflow === "draft").length,
    in_review: posts.filter((p) => p.workflow === "in_review").length,
    approved: posts.filter((p) => p.workflow === "approved").length,
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
          Bilingual articles for <span className="font-medium text-foreground">/blog</span> and{" "}
          <span className="font-medium text-foreground">/ar/blog</span>. An article goes live only after it has been
          approved and published, and each language appears only once it is complete.
        </p>
        {canManage && (
          <div className="flex shrink-0 items-center gap-2">
            <ImportBriefsButton />
            <Button type="button" onClick={() => setEditing(newArticle())}>
              <Plus className="h-4 w-4" /> New article
            </Button>
          </div>
        )}
      </div>

      {canManage && <ReviewedArticleBatch posts={posts} taxonomy={taxonomy} />}

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "brief", "draft", "in_review", "approved", "published"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={
              "rounded-md border px-2.5 py-1 text-xs font-medium transition " +
              (filter === f
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground")
            }
          >
            {f === "all" ? "All" : f === "published" ? "Published" : WORKFLOW_LABEL[f]} ({counts[f]})
          </button>
        ))}
        <select
          aria-label="Filter by brand"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        >
          <option value="">All brands</option>
          {taxonomy.brands.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.name}
            </option>
          ))}
        </select>
        <Input
          aria-label="Search articles"
          placeholder="Search title or slug"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-8 max-w-56 text-xs"
        />
      </div>

      {visible.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          {posts.length === 0
            ? "No articles yet. Import the editorial briefs or create an article."
            : "No articles match these filters."}
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((p) => {
            const live = p.published?.locales ?? []
            const title = p.content.en.title || p.content.ar.title || p.slug
            return (
              <Card key={p.id} className="flex items-center justify-between gap-4 p-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold">{title}</span>
                    <Badge>{WORKFLOW_LABEL[p.workflow]}</Badge>
                    {p.status === "published" && (
                      <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
                        Live {live.length ? live.map((l) => l.toUpperCase()).join(" + ") : "(snapshot unavailable)"}
                      </Badge>
                    )}
                    {p.draftAhead && <Badge>Unpublished changes</Badge>}
                    {p.legacy && <Badge>Legacy · EN only</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    Draft: /blog/{p.slug}
                    {p.brandSlug ? ` · ${brandName.get(p.brandSlug) ?? p.brandSlug}` : ""}
                    {" · "}Draft EN {localeIssues(p.content.en).length === 0 ? "ready" : "not ready"} · AR {localeIssues(p.content.ar).length === 0 ? "ready" : "not ready"}
                  </p>
                  {p.published && (
                    <p className="truncate text-xs text-muted-foreground">
                      Live: /blog/{p.published.slug} · {p.published.title.en || p.published.title.ar}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button type="button" variant="secondary" onClick={() => setEditing(p)}>
                    <Pencil className="h-4 w-4" /> {canManage ? "Edit" : "View"}
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ImportBriefsButton() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              const r = await importEditorialBriefs()
              if (!r.ok) setMsg(r.error ?? "Import failed")
              else
                setMsg(
                  `${r.created} brief${r.created === 1 ? "" : "s"} added` +
                    (r.skipped.length ? `, ${r.skipped.length} skipped (slug in use)` : ""),
                )
              router.refresh()
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Import failed")
            }
          })
        }
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Import briefs
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              const r = await importEditorialArticles()
              if (!r.ok) setMsg(r.error ?? "Import failed")
              else
                setMsg(
                  `${r.created} added, ${r.filled} briefs filled for review` +
                    (r.skipped.length ? `, ${r.skipped.length} kept (already edited)` : ""),
                )
              router.refresh()
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Import failed")
            }
          })
        }
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Import 75 articles
      </Button>
    </div>
  )
}

/* --------------------------------- Editor --------------------------------- */

function ArticleEditor({
  initial,
  all,
  taxonomy,
  canManage,
  onClose,
}: {
  initial: Article
  all: Article[]
  taxonomy: ArticleTaxonomy
  canManage: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [a, setA] = useState<Article>(initial)
  const [revision, setRevision] = useState<number | null>(initial.id ? initial.revision : null)
  const [lang, setLang] = useState<ArticleLang>("en")
  const [pending, start] = useTransition()
  const [error, setError] = useState<{ message: string; issues?: string[]; conflict?: boolean } | null>(null)
  const [saved, setSaved] = useState(false)

  const ro = !canManage
  const copy = a.content[lang]
  const setCopy = (patch: Partial<LocaleCopy>) => {
    setSaved(false)
    setA((prev) => ({ ...prev, content: { ...prev.content, [lang]: { ...prev.content[lang], ...patch } } }))
  }
  const patch = (p: Partial<Article>) => {
    setSaved(false)
    setA((prev) => ({ ...prev, ...p }))
  }

  const issuesIfPublished = publishIssues({ ...a, status: "published" })
  const relatedOptions = all.filter((x) => x.key && x.id !== a.id)

  const run = (intent: ArticleIntent, override?: Partial<Article>) =>
    start(async () => {
      setError(null)
      try {
        const r = await saveArticle({ ...a, ...override }, revision, intent)
        if (!r.ok) {
          setError({ message: r.error, issues: r.issues, conflict: r.conflict })
          return
        }
        setA(r.article)
        setRevision(r.article.revision)
        setSaved(true)
        router.refresh()
      } catch (e) {
        setError({ message: e instanceof Error ? e.message : "Save failed" })
      }
    })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-balance text-lg font-bold">
            {a.id ? a.content.en.title || a.content.ar.title || a.slug : "New article"}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge>{WORKFLOW_LABEL[a.workflow]}</Badge>
            <span>{a.status === "published" ? "Live version exists" : "Not published"}</span>
            {a.draftAhead && <Badge>Unpublished changes</Badge>}
            {a.reviewedBy && a.reviewedAt && (
              <span>
                · Reviewed by {a.reviewedBy} on {new Date(a.reviewedAt).toLocaleDateString()}
              </span>
            )}
            {a.key && <span>· {a.key}</span>}
          </div>
          {a.published && (
            <p className="text-xs text-muted-foreground">
              Live: /blog/{a.published.slug} · {a.published.locales.map((l) => l.toUpperCase()).join(" + ")}
              {" · "}{a.published.title.en || a.published.title.ar}
            </p>
          )}
        </div>
        <Button type="button" variant="ghost" onClick={onClose}>
          Back to list
        </Button>
      </div>

      {a.legacy && (
        <Card className="flex items-start gap-2 p-4 text-xs leading-relaxed text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          This post was written before bilingual articles. It is shown as English only. Saving moves it to the bilingual
          format; Arabic stays hidden until you write it and mark it ready.
        </Card>
      )}

      {a.brief && <BriefPanel brief={a.brief} lang={lang} />}

      <Card className="flex flex-col gap-4 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="a-slug">URL slug (shared by both languages)</Label>
            <Input
              id="a-slug"
              value={a.slug}
              onChange={(e) => patch({ slug: e.target.value })}
              placeholder="porsche-pdk-service-dubai"
              disabled={ro}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="a-brand">Brand</Label>
            <select
              id="a-brand"
              value={a.brandSlug ?? ""}
              onChange={(e) => patch({ brandSlug: e.target.value || null })}
              disabled={ro}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="">No brand (general article)</option>
              {taxonomy.brands.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Services</legend>
          <div className="flex flex-wrap gap-2">
            {taxonomy.services.map((s) => {
              const on = a.serviceSlugs.includes(s.slug)
              return (
                <button
                  key={s.slug}
                  type="button"
                  disabled={ro}
                  aria-pressed={on}
                  onClick={() =>
                    patch({ serviceSlugs: on ? a.serviceSlugs.filter((x) => x !== s.slug) : [...a.serviceSlugs, s.slug] })
                  }
                  className={
                    "rounded-md border px-2.5 py-1 text-xs transition " +
                    (on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")
                  }
                >
                  {s.name}
                </button>
              )
            })}
          </div>
        </fieldset>

        <CoverField a={a} lang={lang} ro={ro} patch={patch} setCopy={setCopy} />
      </Card>

      <Card className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Language" className="inline-flex rounded-lg border border-border p-1">
            {(["en", "ar"] as const).map((l) => {
              const ok = localeIssues(a.content[l]).length === 0
              return (
                <button
                  key={l}
                  role="tab"
                  type="button"
                  aria-selected={lang === l}
                  onClick={() => setLang(l)}
                  className={
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition " +
                    (lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {l === "en" ? "English" : "العربية"}
                  {ok && <Check className="h-3.5 w-3.5" aria-label="complete" />}
                </button>
              )
            })}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={copy.ready}
              disabled={ro}
              onChange={(e) => setCopy({ ready: e.target.checked })}
            />
            {lang === "en" ? "English" : "Arabic"} copy is written and checked
          </label>
        </div>

        <div dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} className="flex flex-col gap-4">
          <LocaleInput label="Title" value={copy.title} onChange={(v) => setCopy({ title: v })} ro={ro} />
          <LocaleInput label="Summary" value={copy.excerpt} onChange={(v) => setCopy({ excerpt: v })} ro={ro} rows={2} />
          <div className="flex flex-col gap-1.5">
            <Label>Body</Label>
            <Textarea
              value={copy.body}
              onChange={(e) => setCopy({ body: e.target.value })}
              rows={16}
              disabled={ro}
              placeholder={"Separate paragraphs with a blank line. Start a line with ## for a subheading."}
            />
            <span className="text-xs text-muted-foreground">
              {copy.body.trim().length} characters (min 600 to publish)
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <LocaleInput label="SEO title" value={copy.seoTitle} onChange={(v) => setCopy({ seoTitle: v })} ro={ro} />
            <LocaleInput label="Call-to-action label" value={copy.ctaLabel} onChange={(v) => setCopy({ ctaLabel: v })} ro={ro} />
          </div>
          <LocaleInput
            label="SEO description"
            value={copy.seoDescription}
            onChange={(v) => setCopy({ seoDescription: v })}
            ro={ro}
            rows={2}
          />
        </div>
        {localeIssues(copy).length > 0 && (
          <p className="text-xs text-muted-foreground">
            {lang === "en" ? "English" : "Arabic"} stays hidden until complete. Missing: {localeIssues(copy).join(", ")}.
          </p>
        )}
      </Card>

      <SourcesField sources={a.sources} ro={ro} onChange={(sources) => patch({ sources })} />

      {relatedOptions.length > 0 && (
        <Card className="flex flex-col gap-2 p-6">
          <Label htmlFor="a-related">Related articles</Label>
          <select
            id="a-related"
            multiple
            disabled={ro}
            value={a.relatedKeys}
            onChange={(e) => patch({ relatedKeys: [...e.target.selectedOptions].map((o) => o.value) })}
            className="min-h-32 rounded-md border border-border bg-background p-2 text-sm"
          >
            {relatedOptions.map((x) => (
              <option key={x.key!} value={x.key!}>
                {x.content.en.title || x.content.ar.title || x.slug}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            Only related articles that are live in the reader&apos;s language are shown.
          </span>
        </Card>
      )}

      {error && (
        <Card role="alert" className="flex flex-col gap-2 border-destructive/40 p-4 text-sm">
          <span className="font-medium text-destructive">{error.message}</span>
          {error.issues && (
            <ul className="list-disc ps-5 text-xs text-muted-foreground">
              {error.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
          {error.conflict && (
            <Button type="button" variant="secondary" onClick={() => { router.refresh(); onClose() }}>
              Reload list
            </Button>
          )}
        </Card>
      )}

      {canManage && (
        <div className="flex flex-col gap-3">
          {issuesIfPublished.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Before this can be published ({issuesIfPublished.length})</summary>
              <ul className="mt-2 list-disc ps-5 leading-relaxed">
                {issuesIfPublished.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={pending} onClick={() => run("save")}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save draft
            </Button>
            {(a.workflow === "brief" || a.workflow === "draft") && (
              <Button type="button" variant="secondary" disabled={pending} onClick={() => run("save", { workflow: "in_review" })}>
                Send to review
              </Button>
            )}
            {a.workflow === "in_review" && (
              <Button type="button" variant="secondary" disabled={pending} onClick={() => run("approve")}>
                Approve
              </Button>
            )}
            {a.workflow === "approved" && (
              <Button type="button" variant="success" disabled={pending || issuesIfPublished.length > 0} onClick={() => run("publish")}>
                {a.status === "published" ? "Publish changes" : "Publish"}
              </Button>
            )}
            {a.status === "published" && (
              <Button type="button" variant="ghost" disabled={pending} onClick={() => run("unpublish")}>
                Unpublish
              </Button>
            )}
            {saved && <span className="text-xs text-muted-foreground">Saved</span>}
          </div>
          {a.workflow === "approved" && (
            <p className="text-xs text-muted-foreground">
              Editing the copy, sources, brand, services or cover sends an approved article back to review.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function LocaleInput({
  label,
  value,
  onChange,
  ro,
  rows,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  ro: boolean
  rows?: number
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {rows ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} disabled={ro} />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} disabled={ro} />
      )}
    </div>
  )
}

function BriefPanel({ brief, lang }: { brief: NonNullable<Article["brief"]>; lang: ArticleLang }) {
  return (
    <details className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
      <summary className="cursor-pointer font-medium">Editorial brief</summary>
      <div className="mt-3 flex flex-col gap-3 text-xs leading-relaxed text-muted-foreground">
        {brief.searchIntent[lang] && (
          <p>
            <span className="font-medium text-foreground">Search intent: </span>
            {brief.searchIntent[lang]}
          </p>
        )}
        {brief.modelScope && (
          <p>
            <span className="font-medium text-foreground">Model scope: </span>
            {brief.modelScope}
          </p>
        )}
        {brief.outline.length > 0 && (
          <ol className="list-decimal ps-5" dir={lang === "ar" ? "rtl" : "ltr"}>
            {brief.outline.map((o, i) => (
              <li key={i}>{o[lang] || o.en}</li>
            ))}
          </ol>
        )}
        {brief.photoBrief && (
          <p>
            <span className="font-medium text-foreground">Photo brief: </span>
            {brief.photoBrief}
          </p>
        )}
        {brief.factualCaution && (
          <p>
            <span className="font-medium text-foreground">Fact-check: </span>
            {brief.factualCaution}
          </p>
        )}
      </div>
    </details>
  )
}

function CoverField({
  a,
  lang,
  ro,
  patch,
  setCopy,
}: {
  a: Article
  lang: ArticleLang
  ro: boolean
  patch: (p: Partial<Article>) => void
  setCopy: (p: Partial<LocaleCopy>) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const copy = a.content[lang]

  return (
    <div className="flex flex-col gap-3">
      <Label>Cover image</Label>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative h-32 w-full shrink-0 overflow-hidden rounded-lg border border-border bg-muted sm:w-56">
          {a.coverUrl ? (
            <Image src={a.coverUrl} alt={copy.coverAlt || "Cover preview"} fill className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No image</div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-3">
          {!ro && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={ref}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setErr(null)
                  const fd = new FormData()
                  fd.append("file", file)
                  start(async () => {
                    try {
                      const { url } = await uploadWebsiteImage(fd)
                      patch({ coverUrl: url })
                    } catch (er) {
                      setErr(er instanceof Error ? er.message : "Upload failed")
                    } finally {
                      if (ref.current) ref.current.value = ""
                    }
                  })
                }}
              />
              <Button type="button" variant="secondary" disabled={pending} onClick={() => ref.current?.click()}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Upload cover
              </Button>
              {a.coverUrl && (
                <Button type="button" variant="ghost" onClick={() => patch({ coverUrl: null })}>
                  <Trash2 className="h-4 w-4" /> Remove
                </Button>
              )}
              {err && <span className="text-xs text-destructive">{err}</span>}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={a.coverIllustrative}
              disabled={ro}
              onChange={(e) => patch({ coverIllustrative: e.target.checked })}
            />
            Illustrative image (not a real job at our garage)
          </label>
          <div dir={lang === "ar" ? "rtl" : "ltr"} className="grid gap-3 md:grid-cols-2">
            <LocaleInput
              label={`Alt text (${lang.toUpperCase()})`}
              value={copy.coverAlt}
              onChange={(v) => setCopy({ coverAlt: v })}
              ro={ro}
            />
            <LocaleInput
              label={`Caption (${lang.toUpperCase()})`}
              value={copy.coverCaption}
              onChange={(v) => setCopy({ coverCaption: v })}
              ro={ro}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function SourcesField({
  sources,
  ro,
  onChange,
}: {
  sources: ArticleSource[]
  ro: boolean
  onChange: (s: ArticleSource[]) => void
}) {
  const update = (i: number, p: Partial<ArticleSource>) => onChange(sources.map((s, j) => (j === i ? { ...s, ...p } : s)))
  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Sources</span>
          <span className="text-xs text-muted-foreground">
            Brand articles need at least one https source that supports the technical claims.
          </span>
        </div>
        {!ro && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => onChange([...sources, { title: "", url: "", supports: "", verifiedOn: new Date().toISOString().slice(0, 10) }])}
          >
            <Plus className="h-4 w-4" /> Add source
          </Button>
        )}
      </div>
      {sources.length === 0 && <p className="text-xs text-muted-foreground">No sources yet.</p>}
      {sources.map((s, i) => (
        <div key={i} className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-[1fr_1fr_auto]">
          <Input aria-label="Source title" placeholder="Title" value={s.title} disabled={ro} onChange={(e) => update(i, { title: e.target.value })} />
          <Input aria-label="Source URL" placeholder="https://" value={s.url} disabled={ro} onChange={(e) => update(i, { url: e.target.value })} />
          <Input
            aria-label="Verified on"
            type="date"
            value={s.verifiedOn}
            disabled={ro}
            onChange={(e) => update(i, { verifiedOn: e.target.value })}
          />
          <Input
            aria-label="What this source supports"
            placeholder="What claim this source supports"
            value={s.supports}
            disabled={ro}
            onChange={(e) => update(i, { supports: e.target.value })}
            className="md:col-span-2"
          />
          {!ro && (
            <Button type="button" variant="ghost" aria-label="Remove source" onClick={() => onChange(sources.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
    </Card>
  )
}
