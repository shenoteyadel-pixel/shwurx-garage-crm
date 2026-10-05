"use client"

import { useRef, useState, useTransition } from "react"
import Image from "next/image"
import { Card, Button, Input, Label, Textarea, Badge } from "@/components/ui"
import { MarketingForm } from "@/components/marketing-form"
import { WebsiteBuilder, type BuilderOpenRequest } from "@/components/website-builder/website-builder"
import { WebsiteOverview, type OverviewAction } from "@/components/website-builder/website-overview"
import { AnalyticsEditor } from "@/components/website-builder/analytics-editor"
import { SITE_CONTENT_GROUPS, SITE_IMAGE_SLOTS } from "@/lib/site-content-fields"
import type { Article } from "@/lib/article-model"
import type { ControlCenterDTO } from "@/lib/website/control-center-data"
import { ArticleManager } from "@/components/website-builder/article-manager"
import { saveSiteContent, saveSiteImages, uploadWebsiteImage } from "@/lib/actions-website"
import {
  Check,
  Loader2,
  BarChart3,
  Type,
  ImageIcon,
  Newspaper,
  Upload,
  Trash2,
  Globe,
  LayoutDashboard,
} from "lucide-react"

type Locale = "en" | "ar"
type TabKey = "overview" | "builder" | "content" | "images" | "blog" | "analytics" | "tracking"

interface FieldMaps {
  en: Record<string, string>
  ar: Record<string, string>
}

export function WebsiteControlCenter({ data }: { data: ControlCenterDTO }) {
  const { access, website, tracking } = data
  const canManageWebsite = access.canManageWebsite && website !== null
  const canViewMarketing = access.canViewMarketing && tracking !== null
  const canManageMarketing = access.canManageMarketing
  const editorState = website?.editorState ?? null
  const fieldValues = (website?.fieldValues ?? { en: {}, ar: {} }) as FieldMaps
  const fieldDefaults = (website?.fieldDefaults ?? { en: {}, ar: {} }) as FieldMaps
  const images = website?.images ?? {}
  const posts: Article[] = website?.posts ?? []
  // Tabs are scoped strictly to the viewer's permissions so the two concerns
  // never overlap: website content/images/blog require website.manage, while
  // tracking & analytics require marketing.view (edit needs marketing.manage).
  // Once the versioned site exists, public pages read only its draft/published
  // documents, so the old Text/Images editors (which write site_content) are
  // retired rather than left saving values nobody sees.
  const legacyContent = canManageWebsite && !editorState?.initialised
  const analytics = data.analytics
  const legacyTracking = canViewMarketing && !analytics?.managed
  const tabs: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    ...(canManageWebsite && editorState?.initialised
      ? ([{ key: "overview", label: "Overview", icon: LayoutDashboard }] as const)
      : []),
    ...(canManageWebsite && editorState ? ([{ key: "builder", label: "Site builder", icon: Globe }] as const) : []),
    ...(legacyContent
      ? ([
          { key: "content", label: "Text & Content", icon: Type },
          { key: "images", label: "Images", icon: ImageIcon },
        ] as const)
      : []),
    ...(canManageWebsite ? ([{ key: "blog", label: "Blog", icon: Newspaper }] as const) : []),
    ...(canViewMarketing && analytics ? ([{ key: "analytics", label: "Analytics", icon: BarChart3 }] as const) : []),
    ...(legacyTracking ? ([{ key: "tracking", label: "Legacy tracking", icon: BarChart3 }] as const) : []),
  ]

  const [tab, setTab] = useState<TabKey>(() => tabs[0]?.key ?? "content")
  const [builderOpen, setBuilderOpen] = useState<BuilderOpenRequest | null>(null)
  const [blogOpen, setBlogOpen] = useState<{ postId?: string; nonce: number } | null>(null)

  const onOverviewAction = (a: OverviewAction) => {
    const nonce = Date.now()
    if (a.kind === "analytics") return setTab("analytics")
    if (a.kind === "add-member") {
      setBuilderOpen({ section: "team", addTeamMember: true, nonce })
      return setTab("builder")
    }
    if (a.kind === "add-page") {
      setBuilderOpen({ section: "custom", nonce })
      return setTab("builder")
    }
    if (a.target.kind === "none") return
    if (a.target.kind === "blog") {
      setBlogOpen({ postId: a.target.postId, nonce })
      return setTab("blog")
    }
    setBuilderOpen({ section: a.target.section, recordId: a.target.recordId, nonce })
    setTab("builder")
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-card/50 p-1.5">
        {tabs.map((t) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={
                "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition " +
                (active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground")
              }
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === "overview" && website && editorState?.initialised && (
        <WebsiteOverview
          overview={website.overview}
          draftVersion={editorState.draftVersion}
          hasUnpublished={editorState.hasUnpublished}
          canAnalytics={canViewMarketing && !!analytics}
          onAction={onOverviewAction}
        />
      )}
      {/* Stays mounted while hidden so unsaved builder edits survive switching tabs. */}
      {canManageWebsite && editorState && (
        <div hidden={tab !== "builder"}>
          <WebsiteBuilder state={editorState} open={builderOpen} />
        </div>
      )}
      {/* Same as the builder: hidden, not unmounted, so pending analytics edits survive tab switches. */}
      {canViewMarketing && analytics && (
        <div hidden={tab !== "analytics"}>
          <AnalyticsEditor data={analytics} canEdit={canManageMarketing} />
        </div>
      )}
      {tab === "content" && legacyContent && (
        <ContentEditor fieldValues={fieldValues} fieldDefaults={fieldDefaults} canManage={canManageWebsite} />
      )}
      {tab === "images" && legacyContent && <ImageManager images={images} canManage={canManageWebsite} />}
      {tab === "blog" && (
        <ArticleManager
          key={blogOpen?.nonce ?? "blog"}
          posts={posts}
          taxonomy={website?.taxonomy ?? { brands: [], services: [] }}
          canManage={canManageWebsite}
          openPostId={blogOpen?.postId}
        />
      )}
      {tab === "tracking" && tracking && legacyTracking && <MarketingForm settings={tracking} canManage={canManageMarketing} />}
    </div>
  )
}

/* ----------------------------- Content editor ----------------------------- */

function ContentEditor({
  fieldValues,
  fieldDefaults,
  canManage,
}: {
  fieldValues: FieldMaps
  fieldDefaults: FieldMaps
  canManage: boolean
}) {
  const [locale, setLocale] = useState<Locale>("en")
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)

  const values = fieldValues[locale]
  const defaults = fieldDefaults[locale]

  return (
    <form
      key={locale}
      action={(fd) =>
        start(async () => {
          await saveSiteContent(fd)
          setSaved(true)
          setTimeout(() => setSaved(false), 2500)
        })
      }
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="locale" value={locale} />

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Editing language</span>
        </div>
        <div className="inline-flex rounded-lg border border-border p-1">
          {(["en", "ar"] as Locale[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLocale(l)}
              className={
                "rounded-md px-3 py-1.5 text-sm font-medium transition " +
                (locale === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")
              }
            >
              {l === "en" ? "English" : "العربية"}
            </button>
          ))}
        </div>
      </Card>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Leave a field empty to use the original wording (shown as the greyed-out placeholder). Anything you type here
        replaces the text live on the website after you save.
      </p>

      {SITE_CONTENT_GROUPS.map((group) => (
        <Card key={group.group} className="p-6">
          <h2 className="text-sm font-semibold">{group.group}</h2>
          {group.description && <p className="mt-1 text-xs text-muted-foreground">{group.description}</p>}
          <div className="mt-4 flex flex-col gap-4">
            {group.fields.map((f) => {
              const name = f.path
              const current = values[f.path] ?? ""
              const ph = defaults[f.path] ?? ""
              return (
                <div key={f.path} dir={locale === "ar" ? "rtl" : "ltr"}>
                  <Label htmlFor={name}>{f.label}</Label>
                  {f.multiline ? (
                    <Textarea
                      id={name}
                      name={name}
                      defaultValue={current}
                      placeholder={ph}
                      disabled={!canManage}
                      rows={3}
                    />
                  ) : (
                    <Input id={name} name={name} defaultValue={current} placeholder={ph} disabled={!canManage} />
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      ))}

      {canManage ? (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
            {saved ? "Saved" : `Save ${locale === "en" ? "English" : "Arabic"} text`}
          </Button>
          <p className="text-xs text-muted-foreground">Changes appear on the website immediately.</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">You have read-only access to website content.</p>
      )}
    </form>
  )
}

/* ------------------------------ Image manager ----------------------------- */

function ImageManager({ images, canManage }: { images: Record<string, string>; canManage: boolean }) {
  const [current, setCurrent] = useState<Record<string, string>>(images)
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)

  const save = () =>
    start(async () => {
      await saveSiteImages(current)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Replace the photos used on the public website. Upload a new image, then Save. Remove an override to fall back to
        the original shipped photo.
      </p>

      {SITE_IMAGE_SLOTS.map((slot) => {
        const url = current[slot.key] || slot.fallback
        const overridden = Boolean(current[slot.key])
        return (
          <Card key={slot.key} className="p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="relative h-32 w-full shrink-0 overflow-hidden rounded-lg border border-border bg-muted sm:w-56">
                <Image src={url || "/placeholder.svg"} alt={slot.label} fill className="object-cover" />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">{slot.label}</h2>
                  {overridden ? (
                    <Badge className="border-primary/30 bg-primary/10 text-primary">Custom</Badge>
                  ) : (
                    <Badge className="border-border bg-muted text-muted-foreground">Default</Badge>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{slot.hint}</p>
                {canManage && (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <UploadButton
                      onUploaded={(u) => setCurrent((c) => ({ ...c, [slot.key]: u }))}
                      label="Upload image"
                    />
                    {overridden && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          setCurrent((c) => {
                            const next = { ...c }
                            delete next[slot.key]
                            return next
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" /> Reset to default
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>
        )
      })}

      {canManage && (
        <div className="flex items-center gap-3">
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
            {saved ? "Saved" : "Save images"}
          </Button>
          <p className="text-xs text-muted-foreground">Changes appear on the website immediately.</p>
        </div>
      )}
    </div>
  )
}

function UploadButton({ onUploaded, label }: { onUploaded: (url: string) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (!file) return
          setError(null)
          const fd = new FormData()
          fd.append("file", file)
          start(async () => {
            try {
              const { url } = await uploadWebsiteImage(fd)
              onUploaded(url)
            } catch (err) {
              setError(err instanceof Error ? err.message : "Upload failed")
            } finally {
              if (ref.current) ref.current.value = ""
            }
          })
        }}
      />
      <Button type="button" variant="secondary" onClick={() => ref.current?.click()} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {label}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </>
  )
}

