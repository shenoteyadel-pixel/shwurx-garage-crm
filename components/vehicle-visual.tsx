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

/* ---------------- Vehicle Visual (real photo or color-accurate placeholder) ----------------
 *
 * There are only TWO image concepts here, and they must never be mixed:
 *
 *   1. REAL CHOSEN PHOTO — a photo a human explicitly selected for this vehicle:
 *        - `coverPhoto`: the job's cover photo (uploaded + "Set as Vehicle Cover Photo"), or
 *        - `referenceImage` when `referenceImageSource === "custom"` (a URL a user set by hand).
 *      A real chosen photo ALWAYS wins and is shown as-is — never recolored.
 *
 *   2. COLOR-ACCURATE PLACEHOLDER — when there is no real chosen photo, we draw the
 *      parametric silhouette from make/model/body-type and the vehicle's DB `color`.
 *
 * Auto-fetched stock images (CarsXE, `image_source === "carsxe"`) are deliberately NOT
 * displayed: they are real photos in an arbitrary colour (often grey) that do not match
 * the stored vehicle colour, so they are treated as "no real photo" and replaced by the
 * colour-accurate placeholder. The stored reference URL is left untouched in the DB.
 */
export function VehicleVisual({
  coverPhoto,
  referenceImage,
  referenceImageSource,
  make,
  model,
  bodyType,
  color,
  className,
  alt,
}: {
  coverPhoto?: string | null
  referenceImage?: string | null
  /** Provenance of `referenceImage`: only "custom" (human-set) images are displayed. */
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

  // Real chosen photo: the cover photo, or a custom (human-set) reference image.
  // Auto-fetched stock images (source !== "custom") are ignored on purpose.
  const activePhoto = coverPhoto && !coverFailed ? coverPhoto : null
  const activeCustom =
    !activePhoto && referenceImage && referenceImageSource === "custom" && !refFailed ? referenceImage : null

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
      ) : activeCustom ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={activeCustom || "/placeholder.svg"}
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
