import { formatCurrency } from "@/lib/utils"
import { TIER_LABEL, loyaltyJoinUrl, loyaltyQrSvg, type LoyaltyInvoiceSummary } from "@/lib/loyalty"

/** Print-safe loyalty panel for invoices: QR to join, or points earned and balance for members. */
export async function LoyaltyDocBlock({ summary }: { summary: LoyaltyInvoiceSummary | null }) {
  if (!summary || !summary.program_enabled || !summary.enroll_token) return null
  const active = summary.membership_status === "active"
  if (!active && summary.membership_status !== "invited") return null
  const url = loyaltyJoinUrl(summary.enroll_token)
  const svg = await loyaltyQrSvg(url)

  return (
    <section className="mt-6 flex break-inside-avoid items-center gap-4 rounded-md border border-neutral-300 p-4">
      <div
        className="h-24 w-24 shrink-0"
        role="img"
        aria-label={active ? "SWURX Rewards QR code" : "Scan to join SWURX Rewards"}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="flex min-w-0 flex-col gap-1 text-sm">
        <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-700">SWURX Rewards</h3>
        {active ? (
          <>
            <p className="text-neutral-900">
              Member {summary.membership_number}
              {summary.tier ? ` · ${TIER_LABEL[summary.tier] ?? summary.tier}` : ""}
            </p>
            <p className="text-neutral-700">
              Points earned on this invoice: <span className="font-semibold tabular-nums">{summary.points_earned}</span>
              {" · "}Available balance:{" "}
              <span className="font-semibold tabular-nums">{summary.points_available ?? 0}</span>
            </p>
            {summary.redeemed_points > 0 && (
              <p className="text-neutral-700">
                Rewards redeemed: {summary.redeemed_points} pts ({formatCurrency(Number(summary.redeemed_value_aed))})
              </p>
            )}
          </>
        ) : (
          <p className="leading-relaxed text-neutral-700">
            Scan to join SWURX Rewards and earn points on every paid service. 100 points = AED 1.
          </p>
        )}
      </div>
    </section>
  )
}
