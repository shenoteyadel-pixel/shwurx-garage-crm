"use client"

import { useState } from "react"
import { brandLogoUrl, brandInitials, resolveVehicleProfile } from "@/lib/vehicle"
import { CarSilhouette } from "@/components/car-silhouette"
import { cn } from "@/lib/utils"

/* ---------------- Brand Logo ---------------- */
export function BrandLogo({
  make,
  size = 40,
  className,
}: {
  make: string | null | undefined
  size?: number
  className?: string
}) {
  const url = brandLogoUrl(make)
  const [failed, setFailed] = useState(false)

  if (!url || failed) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md border border-border bg-secondary font-semibold text-foreground",
          className,
        )}
        style={{ width: size, height: size, fontSize: size * 0.34 }}
        aria-label={make ? `${make} logo` : "Vehicle brand"}
        title={make || undefined}
      >
        {brandInitials(make)}
      </div>
    )
  }

  return (
    <div
      className={cn("flex shrink-0 items-center justify-center rounded-md bg-white/90 p-1", className)}
      style={{ width: size, height: size }}
      title={make || undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url || "/placeholder.svg"}
        alt={make ? `${make} logo` : "Vehicle brand logo"}
        width={size}
        height={size}
        className="h-full w-full object-contain"
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
      />
    </div>
  )
}

/* ---------------- Vehicle Visual (real photo, else silhouette) ----------------
 *
 * Priority — show the most real, most specific image available:
 *
 *   1. `coverPhoto`  — the job's chosen cover photo (a real photo of THIS car).
 *   2. `referenceImage` — the resolved make/model reference photo (e.g. the
 *      CarsXE studio render). This is a real photograph of the correct
 *      make/model; it is shown regardless of source. Model accuracy comes
 *      first: a correct model in a slightly different colour reads far better
 *      than a flat graphic.
 *   3. Silhouette — the colour-accurate parametric drawing, used ONLY as a
 *      last resort when no photo exists at all, so a card is never empty.
 *
 * `referenceImageSource` is accepted for backward compatibility but no longer
 * gates display — any available reference photo is shown.
 */
export function VehicleVisual({
  coverPhoto,
  referenceImage,
  referenceImageSource: _referenceImageSource,
  make,
  model,
  bodyType,
  color,
  className,
  alt,
  variant = "auto",
  onLift = false,
}: {
  coverPhoto?: string | null
  referenceImage?: string | null
  /** Deprecated: accepted but no longer used to gate display. */
  referenceImageSource?: string | null
  make?: string | null
  model?: string | null
  bodyType?: string | null
  color?: string | null
  className?: string
  alt?: string
  /**
   * "auto" (default) shows the most real image available (photo → reference →
   * illustration). "illustration" always renders the colour-accurate drawing on
   * a shared workshop backdrop, so a board of cards looks uniform.
   */
  variant?: "auto" | "illustration"
  /** Raise the car on a 2-post lift (illustration variant only). */
  onLift?: boolean
}) {
  const [coverFailed, setCoverFailed] = useState(false)
  const [refFailed, setRefFailed] = useState(false)

  const profile = resolveVehicleProfile(make, model, bodyType)
  const label = `${make ?? ""} ${model ?? ""}`.trim() || "Vehicle"

  // Board mode: identical illustration + backdrop on every card. Cars parked on
  // a bay are raised on a 2-post lift to show they're up for checking.
  if (variant === "illustration") {
    return (
      <div
        className={cn(
          "relative overflow-hidden bg-gradient-to-b from-secondary/50 via-card to-background",
          className,
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center p-1">
          <CarSilhouette
            profile={profile}
            color={color}
            onLift={onLift}
            title={`${label} — ${color || "unspecified"}`}
          />
        </div>
      </div>
    )
  }

  // Prefer the real cover photo, then the resolved make/model reference photo.
  const activePhoto = coverPhoto && !coverFailed ? coverPhoto : null
  const activeRef = !activePhoto && referenceImage && !refFailed ? referenceImage : null

  return (
    <div className={cn("relative overflow-hidden bg-gradient-to-b from-muted/50 to-card", className)}>
      {activePhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={activePhoto || "/placeholder.svg"}
          alt={alt || label}
          className="h-full w-full object-cover"
          onError={() => setCoverFailed(true)}
          referrerPolicy="no-referrer"
        />
      ) : activeRef ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={activeRef || "/placeholder.svg"}
          alt={alt || label}
          className="h-full w-full object-cover"
          onError={() => setRefFailed(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-1.5">
          <CarSilhouette profile={profile} color={color} title={`${label} — ${color || "unspecified"}`} />
        </div>
      )}
    </div>
  )
}
