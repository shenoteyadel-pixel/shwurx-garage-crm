import type { Settings } from "@/lib/settings"

// SHWURX logo recoloured for white paper (dark letters, green engine mark);
// overridden by a configured logo_url.
const DEFAULT_LOGO = "/brand/shwurx-logo-ink.png"

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
    <div className="border-b-2 border-[#3f8f12] pb-4 [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
      <div className="flex items-center justify-between gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoSrc(settings) || "/placeholder.svg"}
          alt={`${settings.company_name || settings.legal_name || "Company"} logo`}
          className="h-24 w-auto max-w-[280px] shrink-0 object-contain object-left"
        />
        <div className="text-right">
          <div className="inline-block rounded-md bg-neutral-900 px-4 py-1.5 text-base font-bold uppercase tracking-[0.15em] text-white">
            {title}
          </div>
          {number && <p className="mt-2 font-mono text-sm font-semibold text-neutral-800">{number}</p>}
          {date && <p className="text-xs text-neutral-500">{date}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-[11px] leading-relaxed text-neutral-600">
        <div className="flex flex-col">
          <span className="text-xs font-bold uppercase tracking-wide text-neutral-900">
            {settings.legal_name || settings.company_name}
          </span>
          {settings.address && <span>{settings.address}</span>}
        </div>
        <div className="flex flex-col text-right">
          <span className="flex flex-wrap justify-end gap-x-3">
            {settings.phone && <span>Tel {settings.phone}</span>}
            {settings.email && <span>{settings.email}</span>}
          </span>
          {(settings.trade_license || settings.trn) && (
            <span className="flex flex-wrap justify-end gap-x-3 font-semibold text-neutral-800">
              {settings.trade_license && <span>Trade License: {settings.trade_license}</span>}
              {settings.trn && <span>TRN: {settings.trn}</span>}
            </span>
          )}
        </div>
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
        className="w-4/5 max-w-xl -rotate-12 object-contain opacity-[0.06]"
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
