"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import { Link2, Loader2, LocateFixed, MapPin, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { GhostButton, Input, Label } from "@/components/ui"

const LocationMap = dynamic(() => import("./location-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="me-2 h-4 w-4 animate-spin" /> Loading map…
    </div>
  ),
})

const DUBAI = { lat: 25.2048, lng: 55.2708 }
const RADIUS_PRESETS = [100, 200, 300, 500, 1000]

type SearchHit = { display_name: string; lat: string; lon: string }

/** Accepts "25.1, 55.2", Google Maps URLs (@lat,lng / ?q=lat,lng / !3dlat!4dlng) and Apple Maps ?ll= links. */
export function parseCoordinates(text: string): { lat: number; lng: number } | null {
  const s = decodeURIComponent(text.trim())
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|ll|query|center|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/,
  ]
  for (const re of patterns) {
    const m = s.match(re)
    if (m) {
      const lat = Number(m[1])
      const lng = Number(m[2])
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }
    }
  }
  return null
}

function getPosition(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    ),
  )
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

export function LocationPicker({
  lat,
  lng,
  radius,
  onChange,
  onRadiusChange,
}: {
  lat: number | null
  lng: number | null
  radius: number
  onChange: (lat: number | null, lng: number | null) => void
  onRadiusChange: (radius: number) => void
}) {
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<SearchHit[]>([])
  const [busy, setBusy] = useState<"search" | "gps" | null>(null)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [showManual, setShowManual] = useState(false)

  const place = (la: number, ln: number, text?: string) => {
    onChange(round6(la), round6(ln))
    setHits([])
    setNote({ ok: true, text: text ?? "Pin placed. Drag it or click the map to fine-tune, then save." })
  }

  async function runSearch() {
    const q = query.trim()
    if (!q) return
    const coords = parseCoordinates(q)
    if (coords) return place(coords.lat, coords.lng, "Location taken from the link / coordinates.")
    if (/^https?:\/\//i.test(q)) {
      setNote({
        ok: false,
        text: "That short link has no coordinates. In Google Maps, long-press the workshop, copy the numbers shown (e.g. 25.12, 55.21) and paste them here.",
      })
      return
    }
    setBusy("search")
    setNote(null)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=ae&q=${encodeURIComponent(q)}`,
        { headers: { Accept: "application/json" } },
      )
      const data: SearchHit[] = res.ok ? await res.json() : []
      setHits(data)
      if (data.length === 0) setNote({ ok: false, text: "No place found. Try an area name, or click the map directly." })
    } catch {
      setNote({ ok: false, text: "Search is unavailable right now. Click the map or paste coordinates instead." })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <li className="rounded-lg border border-border bg-muted/40 px-3 py-2">
          <span className="font-semibold text-foreground">1. Find the workshop</span> — search the area, paste a Google
          Maps link, or use your location.
        </li>
        <li className="rounded-lg border border-border bg-muted/40 px-3 py-2">
          <span className="font-semibold text-foreground">2. Adjust the pin</span> — click the map or drag the pin onto
          the workshop building.
        </li>
        <li className="rounded-lg border border-border bg-muted/40 px-3 py-2">
          <span className="font-semibold text-foreground">3. Pick the radius</span> — staff can only check in inside
          the shaded circle. Then save.
        </li>
      </ol>

      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search address or paste a map link"
              placeholder="e.g. Al Quoz Industrial 3, or paste a Google Maps link / 25.13, 55.22"
              className="ps-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229) return
                e.preventDefault()
                runSearch()
              }}
              onPaste={(e) => {
                const coords = parseCoordinates(e.clipboardData.getData("text"))
                if (coords) {
                  e.preventDefault()
                  setQuery(`${coords.lat}, ${coords.lng}`)
                  place(coords.lat, coords.lng, "Location taken from the pasted link.")
                }
              }}
            />
          </div>
          <GhostButton type="button" disabled={busy !== null} onClick={runSearch}>
            {busy === "search" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Find
          </GhostButton>
          <GhostButton
            type="button"
            disabled={busy !== null}
            title="Use my current location"
            onClick={async () => {
              setBusy("gps")
              const p = await getPosition()
              setBusy(null)
              if (p) place(p.lat, p.lng, "Using your current location. Check the pin sits on the workshop.")
              else setNote({ ok: false, text: "Could not read your location. Allow location access, or search / click the map instead." })
            }}
          >
            {busy === "gps" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
            <span className="hidden sm:inline">My location</span>
          </GhostButton>
        </div>

        {hits.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-[1000] mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
            {hits.map((h) => (
              <li key={`${h.lat},${h.lon}`}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 px-3 py-2 text-start text-sm hover:bg-muted"
                  onClick={() => place(Number(h.lat), Number(h.lon))}
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="line-clamp-2">{h.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="h-80 overflow-hidden rounded-xl border border-border sm:h-96">
        <LocationMap lat={lat} lng={lng} radius={radius} fallback={DUBAI} onPick={(a, b) => place(a, b)} />
      </div>

      {note && (
        <p role="status" className={cn("text-xs", note.ok ? "text-primary" : "text-destructive")}>
          {note.text}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">Allowed check-in radius</span>
        <div className="flex flex-wrap items-center gap-2">
          {RADIUS_PRESETS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={radius === r}
              onClick={() => onRadiusChange(r)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm tabular-nums",
                radius === r
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {r >= 1000 ? `${r / 1000} km` : `${r} m`}
            </button>
          ))}
          <div className="flex items-center gap-2">
            <Input
              aria-label="Custom radius in metres"
              type="number"
              min={50}
              max={5000}
              className="w-24"
              value={radius}
              onChange={(e) => onRadiusChange(Number(e.target.value))}
            />
            <span className="text-xs text-muted-foreground">m</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        {lat != null && lng != null ? (
          <>
            <span className="tabular-nums text-muted-foreground">
              {lat}, {lng}
            </span>
            <a
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
              href={`https://www.google.com/maps?q=${lat},${lng}`}
              target="_blank"
              rel="noreferrer"
            >
              <Link2 className="h-3.5 w-3.5" /> Open in Google Maps
            </a>
            <button
              type="button"
              className="text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
              onClick={() => {
                onChange(null, null)
                setNote(null)
              }}
            >
              Clear location
            </button>
          </>
        ) : (
          <span className="text-muted-foreground">No location set yet — staff cannot check in until you set one.</span>
        )}
        <button
          type="button"
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          onClick={() => setShowManual((v) => !v)}
        >
          {showManual ? "Hide" : "Enter"} coordinates manually
        </button>
      </div>

      {showManual && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="s-lat">Latitude</Label>
            <Input
              id="s-lat"
              type="number"
              step="any"
              value={lat ?? ""}
              onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value), lng)}
            />
          </div>
          <div>
            <Label htmlFor="s-lng">Longitude</Label>
            <Input
              id="s-lng"
              type="number"
              step="any"
              value={lng ?? ""}
              onChange={(e) => onChange(lat, e.target.value === "" ? null : Number(e.target.value))}
            />
          </div>
        </div>
      )}
    </div>
  )
}
