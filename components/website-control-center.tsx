"use client"

import { useRef, useState, useTransition } from "react"
import Image from "next/image"
import { Card, Button, Input, Label, Textarea, Badge } from "@/components/ui"
import { MarketingForm } from "@/components/marketing-form"
import { SITE_CONTENT_GROUPS, SITE_IMAGE_SLOTS } from "@/lib/site-content-fields"
import type { Settings } from "@/lib/settings"
import type { BlogPost } from "@/lib/blog"
import {
  saveSiteContent,
  saveSiteImages,
  uploadWebsiteImage,
  saveBlogPost,
  deleteBlogPost,
} from "@/lib/actions-website"
import {
  Check,
  Loader2,
  BarChart3,
  Type,
  ImageIcon,
  Newspaper,
  Upload,
  Trash2,
  Plus,
  Pencil,
  Globe,
} from "lucide-react"

type Locale = "en" | "ar"
type TabKey = "content" | "images" | "blog" | "tracking"

interface FieldMaps {
  en: Record<string, string>
  ar: Record<string, string>
}

export function WebsiteControlCenter({
  settings,
  canManage,
  fieldValues,
  fieldDefaults,
  images,
  posts,
}: {
  settings: Settings
  canManage: boolean
  fieldValues: FieldMaps
  fieldDefaults: FieldMaps
  images: Record<string, string>
  posts: BlogPost[]
}) {
  const [tab, setTab] = useState<TabKey>("content")

  const tabs: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "content", label: "Text & Content", icon: Type },
    { key: "images", label: "Images", icon: ImageIcon },
    { key: "blog", label: "Blog", icon: Newspaper },
    { key: "tracking", label: "Tracking & Analytics", icon: BarChart3 },
  ]

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

      {tab === "content" && (
        <ContentEditor fieldValues={fieldValues} fieldDefaults={fieldDefaults} canManage={canManage} />
      )}
      {tab === "images" && <ImageManager images={images} canManage={canManage} />}
      {tab === "blog" && <BlogManager posts={posts} canManage={canManage} />}
      {tab === "tracking" && <MarketingForm settings={settings} canManage={canManage} />}
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

/* ------------------------------- Blog manager ----------------------------- */

const emptyPost = { id: "", slug: "", title: "", excerpt: "", cover_url: "", body: "", status: "draft" as const }
type Draft = {
  id: string
  slug: string
  title: string
  excerpt: string
  cover_url: string
  body: string
  status: "draft" | "published"
}

function BlogManager({ posts, canManage }: { posts: BlogPost[]; canManage: boolean }) {
  const [editing, setEditing] = useState<Draft | null>(null)

  if (editing) {
    return <BlogEditor draft={editing} onClose={() => setEditing(null)} canManage={canManage} />
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Write posts for the public <span className="font-medium text-foreground">/blog</span> page. Drafts stay hidden
          until you publish them.
        </p>
        {canManage && (
          <Button type="button" onClick={() => setEditing({ ...emptyPost })}>
            <Plus className="h-4 w-4" /> New post
          </Button>
        )}
      </div>

      {posts.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          No posts yet. Create your first article to start your blog.
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {posts.map((p) => (
            <Card key={p.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{p.title}</span>
                  {p.status === "published" ? (
                    <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-500">Published</Badge>
                  ) : (
                    <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-600">Draft</Badge>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">/blog/{p.slug}</p>
              </div>
              {canManage && (
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setEditing({
                        id: p.id,
                        slug: p.slug,
                        title: p.title,
                        excerpt: p.excerpt ?? "",
                        cover_url: p.cover_url ?? "",
                        body: p.body,
                        status: p.status,
                      })
                    }
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  <DeletePostButton id={p.id} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function BlogEditor({ draft, onClose, canManage }: { draft: Draft; onClose: () => void; canManage: boolean }) {
  const [pending, start] = useTransition()
  const [cover, setCover] = useState(draft.cover_url)
  const [status, setStatus] = useState<"draft" | "published">(draft.status)

  return (
    <form
      action={(fd) =>
        start(async () => {
          fd.set("cover_url", cover)
          fd.set("status", status)
          await saveBlogPost(fd)
          onClose()
        })
      }
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="id" value={draft.id} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{draft.id ? "Edit post" : "New post"}</h2>
        <Button type="button" variant="ghost" onClick={onClose}>
          Back to list
        </Button>
      </div>

      <Card className="flex flex-col gap-4 p-6">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" defaultValue={draft.title} placeholder="How to prepare your car for summer" required disabled={!canManage} />
        </div>
        <div>
          <Label htmlFor="slug">URL slug (optional)</Label>
          <Input id="slug" name="slug" defaultValue={draft.slug} placeholder="auto-generated from the title" disabled={!canManage} />
        </div>
        <div>
          <Label htmlFor="excerpt">Short summary</Label>
          <Textarea id="excerpt" name="excerpt" defaultValue={draft.excerpt} rows={2} placeholder="One or two sentences shown on the blog list." disabled={!canManage} />
        </div>

        <div>
          <Label>Cover image</Label>
          <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="relative h-28 w-full shrink-0 overflow-hidden rounded-lg border border-border bg-muted sm:w-48">
              {cover ? (
                <Image src={cover || "/placeholder.svg"} alt="Cover" fill className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No image</div>
              )}
            </div>
            {canManage && (
              <div className="flex flex-wrap items-center gap-2">
                <UploadButton onUploaded={setCover} label="Upload cover" />
                {cover && (
                  <Button type="button" variant="ghost" onClick={() => setCover("")}>
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="body">Content</Label>
          <Textarea id="body" name="body" defaultValue={draft.body} rows={12} placeholder="Write your article here…" disabled={!canManage} />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Status:</span>
          <div className="inline-flex rounded-lg border border-border p-1">
            {(["draft", "published"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                disabled={!canManage}
                className={
                  "rounded-md px-3 py-1.5 text-sm font-medium capitalize transition " +
                  (status === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")
                }
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {canManage && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {status === "published" ? "Save & publish" : "Save draft"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      )}
    </form>
  )
}

function DeletePostButton({ id }: { id: string }) {
  const [pending, start] = useTransition()
  const [confirm, setConfirm] = useState(false)

  if (confirm) {
    return (
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="danger"
          onClick={() => start(async () => { await deleteBlogPost(id) })}
          disabled={pending}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setConfirm(false)}>
          Cancel
        </Button>
      </div>
    )
  }

  return (
    <Button type="button" variant="ghost" onClick={() => setConfirm(true)} aria-label="Delete post">
      <Trash2 className="h-4 w-4" />
    </Button>
  )
}
