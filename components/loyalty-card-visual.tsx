import { cn } from "@/lib/utils"

export type CardTier = "member" | "silver" | "vip"

// Brand-fixed palette for the physical/digital card artwork (independent of the CRM light/dark theme).
export const CARD_GREEN = "#39d353"
export const CARD_PURPLE = "#8b2cf5"
export const CARD_BLACK = "#08080a"
export const CARD_SILVER = "#d9dce1"

export const CARD_BRANDS = ["porsche", "mercedes", "audi", "landrover", "ferrari", "lamborghini", "bmw", "maserati"]

export const TIER_LABEL: Record<CardTier, string> = { member: "MEMBER", silver: "SILVER", vip: "VIP" }

export function LoyaltyCardVisual({
  tier,
  name,
  membershipNumber,
  points,
  status,
  size = "md",
  className,
}: {
  tier: CardTier
  name: string
  membershipNumber: string
  points?: number
  status?: string
  size?: "sm" | "md"
  className?: string
}) {
  const label = TIER_LABEL[tier] ?? TIER_LABEL.member
  const inactive = status && status !== "active"
  const sm = size === "sm"
  return (
    <div
      className={cn("@container relative aspect-[1.586/1] w-full overflow-hidden rounded-2xl shadow-2xl", inactive && "opacity-75", className)}
      style={{
        background: `linear-gradient(160deg, #141418 0%, ${CARD_BLACK} 55%, #0d0d10 100%)`,
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.08)`,
        color: CARD_SILVER,
      }}
      role="img"
      aria-label={`SHWURX ${label} loyalty card for ${name}, member ID ${membershipNumber}`}
    >
      <img
        src="/brand/card-car.png"
        alt=""
        className="pointer-events-none absolute right-0 top-[26%] h-[56%] w-[62%] object-cover object-left"
        style={{ maskImage: "linear-gradient(to right, transparent 0%, #000 35%)", WebkitMaskImage: "linear-gradient(to right, transparent 0%, #000 35%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(118deg, transparent 0 46%, ${CARD_GREEN}66 46.2%, transparent 46.6%), linear-gradient(118deg, transparent 0 88%, ${CARD_PURPLE}55 88% 92%, transparent 92%)`,
        }}
      />

      <div className={cn("relative flex h-full flex-col justify-between", sm ? "p-[5%]" : "p-[5.5%]")}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <img src="/brand/shwurx-logo.png" alt="" className="h-[clamp(1.25rem,13cqw,3.25rem)] w-auto self-start object-contain" />
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <p className="text-[clamp(6px,2.6cqw,12px)] font-medium uppercase leading-snug tracking-[0.35em]">
              Loyalty
              <br />
              Member
            </p>
            <span
              className="rounded-full border px-[0.6em] py-[0.15em] text-[clamp(6px,2.2cqw,11px)] font-semibold tracking-widest"
              style={{ borderColor: tier === "vip" ? "#d4af37" : CARD_GREEN, color: tier === "vip" ? "#d4af37" : CARD_GREEN }}
            >
              {label}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-[3cqw]">
          <div
            aria-hidden
            className="aspect-[1.3/1] w-[11cqw] rounded-[18%]"
            style={{
              background:
                "linear-gradient(90deg, transparent 32%, rgba(0,0,0,0.25) 32% 34%, transparent 34% 66%, rgba(0,0,0,0.25) 66% 68%, transparent 68%), linear-gradient(0deg, transparent 32%, rgba(0,0,0,0.25) 32% 34%, transparent 34% 66%, rgba(0,0,0,0.25) 66% 68%, transparent 68%), linear-gradient(135deg, #f3d27a, #b8862f 55%, #e9c46a)",
            }}
          />
          <svg aria-hidden viewBox="0 0 24 24" className="w-[5cqw]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M7 8a6 6 0 0 1 0 8" />
            <path d="M11 5.5a10 10 0 0 1 0 13" />
            <path d="M15 3a14 14 0 0 1 0 18" />
          </svg>
        </div>

        <div className="flex flex-col gap-[0.6cqw]">
          <p className="truncate text-[clamp(9px,5cqw,22px)] font-medium uppercase tracking-[0.18em] text-[#f3f4f6]">{name}</p>
          <p className="text-[clamp(6px,2.2cqw,10px)] uppercase tracking-[0.25em] opacity-70">Member ID</p>
          <div className="flex items-end justify-between gap-2">
            <p className="font-mono text-[clamp(8px,4.2cqw,19px)] tracking-[0.2em]">{membershipNumber}</p>
            {typeof points === "number" ? (
              <p className="text-[clamp(8px,3.4cqw,15px)] font-semibold tabular-nums" style={{ color: CARD_GREEN }}>
                {points.toLocaleString("en-AE")} pts
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-[1.6cqw]">
          <div className="flex items-center justify-between gap-[1cqw] border-t border-[#ffffff1f] pt-[1.8cqw]">
            {CARD_BRANDS.map((b) => (
              <img key={b} src={`/brands/${b}.svg`} alt="" className="h-[4.2cqw] w-[8cqw] object-contain opacity-80 brightness-0 invert" />
            ))}
          </div>
          <p className="text-center text-[clamp(5px,1.9cqw,9px)] uppercase tracking-[0.45em] opacity-70">
            One Garage Limitless Solution
          </p>
        </div>
      </div>
      {inactive ? (
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-[#000000b3] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
          {status}
        </span>
      ) : null}
    </div>
  )
}
