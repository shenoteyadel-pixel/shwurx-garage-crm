"use client"

import { useTransition } from "react"
import { Eye } from "lucide-react"
import { setWebsitePreview } from "@/lib/actions-website-cms"

/** Shown only to an authorised editor viewing an unpublished draft or revision. */
export function PreviewBar({ label }: { label: string }) {
  const [pending, start] = useTransition()
  return (
    <div role="status" className="border-b border-primary/40 bg-secondary text-secondary-foreground">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2 text-sm lg:px-8" dir="ltr">
        <Eye className="h-4 w-4 text-primary" aria-hidden="true" />
        <span className="font-semibold">Preview: {label}</span>
        <span className="text-muted-foreground">Not public. Analytics and enquiries are disabled.</span>
        <a href="/marketing" className="ms-auto underline underline-offset-4">
          Website Center
        </a>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await setWebsitePreview("off")
              window.location.reload()
            })
          }
          className="rounded-md border border-border px-3 py-1 font-medium hover:border-primary/60 disabled:opacity-50"
        >
          Exit preview
        </button>
      </div>
    </div>
  )
}
