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
        crossOrigin="anonymous"
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
}) {
  const [coverFailed, setCoverFailed] = useState(false)
  const [refFailed, setRefFailed] = useState(false)

  const profile = resolveVehicleProfile(make, model, bodyType)
  const label = `${make ?? ""} ${model ?? ""}`.trim() || "Vehicle"

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
          crossOrigin="anonymous"
        />
      ) : activeRef ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={activeRef || "/placeholder.svg"}
          alt={alt || label}
          className="h-full w-full object-cover"
          onError={() => setRefFailed(true)}
          crossOrigin="anonymous"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-1.5">
          <CarSilhouette profile={profile} color={color} title={`${label} — ${color || "unspecified"}`} />
        </div>
      )}
    </div>
  )
}
