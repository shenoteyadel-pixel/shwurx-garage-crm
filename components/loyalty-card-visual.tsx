import { cn } from "@/lib/utils"

export type CardTier = "member" | "silver" | "vip"

// Brand-fixed palette for the physical/digital card artwork (independent of the CRM light/dark theme).
const TIER_STYLE: Record<CardTier, { label: string; accent: string; edge: string; text: string }> = {
  member: { label: "MEMBER", accent: "#39d353", edge: "#39d353", text: "#e5e7eb" },
  silver: { label: "SILVER", accent: "#c0c4cc", edge: "#8b5cf6", text: "#f3f4f6" },
  vip: { label: "VIP", accent: "#d4af37", edge: "#8b5cf6", text: "#fdf6e3" },
}

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
  const t = TIER_STYLE[tier] ?? TIER_STYLE.member
  const inactive = status && status !== "active"
  return (
    <div
      className={cn(
        "relative aspect-[1.586/1] w-full overflow-hidden rounded-2xl shadow-lg",
        inactive && "opacity-75",
        className,
      )}
      style={{
        background:
          "repeating-linear-gradient(45deg, rgba(255,255,255,0.025) 0 2px, transparent 2px 6px), linear-gradient(135deg, #0b0b0d 0%, #16161a 60%, #0b0b0d 100%)",
        boxShadow: `inset 0 0 0 1px ${t.edge}55, inset -6px 0 18px -10px ${t.edge}`,
        color: t.text,
      }}
      role="img"
      aria-label={`${t.label} loyalty card for ${name}, ${membershipNumber}`}
    >
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: t.accent }} />
      <div className={cn("flex h-full flex-col justify-between", size === "sm" ? "p-3" : "p-5")}>
        <div className="flex items-start justify-between gap-2">
          <img
            src="/brand/shwurx-logo.png"
            alt=""
            className={cn("w-auto object-contain", size === "sm" ? "h-6" : "h-9")}
          />
          <span
            className={cn(
              "rounded-full border font-semibold tracking-widest",
              size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs",
            )}
            style={{ borderColor: t.accent, color: t.accent }}
          >
            {t.label}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <p className={cn("font-medium uppercase tracking-[0.2em] opacity-60", size === "sm" ? "text-[9px]" : "text-[10px]")}>
            SWURX Loyalty Member
          </p>
          <p className={cn("truncate font-semibold", size === "sm" ? "text-sm" : "text-lg")}>{name}</p>
          <div className="flex items-end justify-between gap-2">
            <p className={cn("font-mono tracking-widest opacity-80", size === "sm" ? "text-[11px]" : "text-sm")}>
              {membershipNumber}
            </p>
            {typeof points === "number" ? (
              <p className={cn("font-semibold tabular-nums", size === "sm" ? "text-xs" : "text-sm")} style={{ color: t.accent }}>
                {points.toLocaleString("en-AE")} pts
              </p>
            ) : null}
          </div>
        </div>
      </div>
      {inactive ? (
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
          {status}
        </span>
      ) : null}
    </div>
  )
}
