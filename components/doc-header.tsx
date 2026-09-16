import type { Settings } from "@/lib/settings"

// Default luxury emblem shipped with the app; overridden by a configured logo_url.
const DEFAULT_LOGO = "/brand/shwurx-emblem.png"

function logoSrc(settings: Settings) {
  return settings.logo_url || DEFAULT_LOGO
}

// Luxury marques the workshop is equipped to service. Rendered as a footer
// strip on every printable document to signal specialisation.
export const SERVICED_BRANDS: { name: string; file: string }[] = [
  { name: "Mercedes-Benz", file: "mercedes" },
  { name: "BMW", file: "bmw" },
  { name: "Porsche", file: "porsche" },
  { name: "Audi", file: "audi" },
  { name: "Ferrari", file: "ferrari" },
  { name: "Lamborghini", file: "lamborghini" },
  { name: "Bentley", file: "bentley" },
  { name: "Rolls-Royce", file: "rollsroyce" },
  { name: "Aston Martin", file: "astonmartin" },
  { name: "Maserati", file: "maserati" },
  { name: "McLaren", file: "mclaren" },
  { name: "Jaguar", file: "jaguar" },
  { name: "Land Rover", file: "landrover" },
  { name: "Volkswagen", file: "volkswagen" },
]

// Shared branded header for all printable documents (invoices, POs, quotations).
export function DocHeader({
  settings,
  title,
  number,
  date,
}: {
  settings: Settings
  title: string
  number?: string | null
  date?: string | null
}) {
  return (
    <div className="flex items-start justify-between border-b-2 border-[#e51f2b] pb-5">
      <div className="flex items-start gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoSrc(settings) || "/placeholder.svg"}
          alt={`${settings.company_name || settings.legal_name || "Company"} logo`}
          className="h-16 w-16 shrink-0 object-contain"
        />
        <div>
          <div className="text-xl font-extrabold uppercase leading-tight tracking-tight text-neutral-900">
            {settings.legal_name || settings.company_name}
          </div>
          {settings.company_name && settings.company_name !== settings.legal_name && (
            <p className="mt-0.5 text-xs font-medium text-[#e51f2b]">
              {settings.company_name?.toUpperCase().includes("SHWURX")
                ? "SHWURX Auto Service Center"
                : settings.company_name}
            </p>
          )}
          <div className="mt-1.5 space-y-0.5 text-[11px] text-neutral-500">
            {settings.address && <div>{settings.address}</div>}
            <div className="flex flex-wrap gap-x-3">
              {settings.phone && <span>Tel {settings.phone}</span>}
              {settings.email && <span>{settings.email}</span>}
            </div>
            {(settings.trade_license || settings.trn) && (
              <div className="flex flex-wrap gap-x-3 pt-0.5 font-medium text-neutral-700">
                {settings.trade_license && <span>Trade License: {settings.trade_license}</span>}
                {settings.trn && <span>TRN: {settings.trn}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-lg font-bold uppercase tracking-wide">{title}</div>
        {number && <p className="mt-1 font-mono text-sm text-neutral-600">{number}</p>}
        {date && <p className="text-xs text-neutral-500">{date}</p>}
      </div>
    </div>
  )
}

// Faint centered emblem printed behind the document body. The parent document
// container MUST be `relative isolate` so the negative z-index sits above the
// white background but below the content.
export function DocWatermark({ settings }: { settings: Settings }) {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoSrc(settings) || "/placeholder.svg"}
        alt=""
        aria-hidden="true"
        className="w-2/3 max-w-md object-contain opacity-[0.04]"
      />
    </div>
  )
}

// Footer strip showing the luxury marques the workshop services.
export function DocBrandStrip() {
  return (
    <div className="mt-8 border-t border-neutral-200 pt-4">
      <div className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
        Specialists in the world&apos;s finest marques
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        {SERVICED_BRANDS.map((b) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={b.file}
            src={`/brands/${b.file}.svg`}
            alt={b.name}
            title={b.name}
            className="h-6 w-auto object-contain opacity-60 grayscale"
          />
        ))}
      </div>
    </div>
  )
}

export function DocFooter({ settings }: { settings: Settings }) {
  return (
    <div className="mt-6 border-t border-neutral-200 pt-4 text-center text-xs text-neutral-400">
      {settings.footer_note || "Thank you for your business."}
      {settings.website && (
        <>
          <br />
          {settings.website}
        </>
      )}
    </div>
  )
}
