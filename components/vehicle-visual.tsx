"use client"

import { useState } from "react"
import { brandLogoUrl, brandInitials, resolveSilhouette } from "@/lib/vehicle"
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

/* ---------------- Vehicle Visual (cover photo or silhouette) ---------------- */
export function VehicleVisual({
  coverPhoto,
  make,
  model,
  bodyType,
  className,
  alt,
}: {
  coverPhoto?: string | null
  make?: string | null
  model?: string | null
  bodyType?: string | null
  className?: string
  alt?: string
}) {
  const [coverFailed, setCoverFailed] = useState(false)
  const showCover = coverPhoto && !coverFailed
  const silhouette = resolveSilhouette(bodyType, make, model)

  return (
    <div className={cn("relative overflow-hidden bg-gradient-to-b from-secondary/60 to-background", className)}>
      {showCover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverPhoto || "/placeholder.svg"}
          alt={alt || `${make ?? ""} ${model ?? ""}`.trim() || "Vehicle"}
          className="h-full w-full object-cover"
          onError={() => setCoverFailed(true)}
          crossOrigin="anonymous"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={silhouette || "/placeholder.svg"}
            alt={`${make ?? ""} ${model ?? ""}`.trim() + " silhouette" || "Vehicle silhouette"}
            className="h-full max-h-full w-full max-w-full object-contain opacity-80"
          />
        </div>
      )}
    </div>
  )
}
