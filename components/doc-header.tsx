import type { Settings } from "@/lib/settings"

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
      <div>
        <div className="text-xl font-extrabold uppercase leading-tight tracking-tight text-neutral-900">
          {settings.legal_name || settings.company_name}
        </div>
        {settings.company_name && settings.company_name !== settings.legal_name && (
          <p className="mt-0.5 text-xs font-medium text-[#e51f2b]">
            {settings.company_name?.toUpperCase().includes("SHWURX") ? "SHWURX Auto Service Center" : settings.company_name}
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
      <div className="text-right">
        <div className="text-lg font-bold uppercase tracking-wide">{title}</div>
        {number && <p className="mt-1 font-mono text-sm text-neutral-600">{number}</p>}
        {date && <p className="text-xs text-neutral-500">{date}</p>}
      </div>
    </div>
  )
}

export function DocFooter({ settings }: { settings: Settings }) {
  return (
    <div className="mt-10 border-t border-neutral-200 pt-4 text-center text-xs text-neutral-400">
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
