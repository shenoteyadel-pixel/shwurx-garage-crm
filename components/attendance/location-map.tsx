"use client"

import "leaflet/dist/leaflet.css"
import L from "leaflet"
import { useEffect } from "react"
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet"

const pinIcon = L.divIcon({
  className: "",
  html: '<div style="width:22px;height:22px;border-radius:9999px;background:var(--primary);border:3px solid var(--background);box-shadow:0 2px 8px rgba(0,0,0,.45)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) })
  return null
}

function FollowPin({ lat, lng, radius }: { lat: number; lng: number; radius: number }) {
  const map = useMap()
  useEffect(() => {
    const bounds = L.latLng(lat, lng).toBounds(radius * 2.6)
    map.flyToBounds(bounds, { duration: 0.6 })
  }, [lat, lng, radius, map])
  return null
}

export default function LocationMap({
  lat,
  lng,
  radius,
  fallback,
  onPick,
}: {
  lat: number | null
  lng: number | null
  radius: number
  fallback: { lat: number; lng: number }
  onPick: (lat: number, lng: number) => void
}) {
  const hasPin = lat != null && lng != null
  const center: [number, number] = hasPin ? [lat, lng] : [fallback.lat, fallback.lng]

  return (
    <MapContainer center={center} zoom={hasPin ? 16 : 11} scrollWheelZoom className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickToPlace onPick={onPick} />
      {hasPin && (
        <>
          <FollowPin lat={lat} lng={lng} radius={radius} />
          <Circle
            center={[lat, lng]}
            radius={radius}
            pathOptions={{ color: "var(--primary)", fillColor: "var(--primary)", fillOpacity: 0.15, weight: 2 }}
          />
          <Marker
            position={[lat, lng]}
            icon={pinIcon}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const p = (e.target as L.Marker).getLatLng()
                onPick(p.lat, p.lng)
              },
            }}
          />
        </>
      )}
    </MapContainer>
  )
}
