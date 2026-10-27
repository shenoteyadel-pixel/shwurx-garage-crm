import type { Metadata } from "next"
import QRCode from "qrcode"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { LoyaltyCardVisual, type CardTier } from "@/components/loyalty-card-visual"
import { LoyaltySaveCard } from "@/components/loyalty-save-card"
import { JoinForm } from "./join-form"

export const dynamic = "force-dynamic"

// The 64-char enroll token is the customer's private link, so it is the only key used here.
async function loadActiveCard(token: string) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("loyalty_memberships")
    .select("membership_number, tier, points_balance, status, customers(full_name)")
    .eq("enroll_token", token)
    .eq("status", "active")
    .maybeSingle()
  if (!data) return null
  const customer = (Array.isArray(data.customers) ? data.customers[0] : data.customers) as
    | { full_name: string | null }
    | null
  const membershipNumber = String(data.membership_number)
  const [qrSvg, qrPng] = await Promise.all([
    QRCode.toString(membershipNumber, { type: "svg", errorCorrectionLevel: "M", margin: 0, width: 180 }),
    QRCode.toDataURL(membershipNumber, { errorCorrectionLevel: "M", margin: 0, width: 560 }),
  ])
  return {
    name: (customer?.full_name ?? "").trim().toUpperCase() || "SWURX MEMBER",
    membershipNumber,
    tier: (["member", "silver", "vip"].includes(data.tier) ? data.tier : "member") as CardTier,
    points: Number(data.points_balance ?? 0),
    qrSvg,
    qrPng,
  }
}

export const metadata: Metadata = {
  title: "Join SWURX Rewards",
  description: "Earn points on every paid service at SWURX Auto.",
  robots: { index: false, follow: false },
}

export default async function LoyaltyJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const valid = /^[0-9a-f]{64}$/.test(token)
  const supabase = await createClient()
  const { data } = valid ? await supabase.rpc("loyalty_enroll_lookup", { p_token: token }) : { data: null }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { first_name: string; status: string; membership_number: string | null; locked: boolean }
    | undefined

  const card = row?.status === "active" ? await loadActiveCard(token) : null

  return (
    <main className="min-h-screen bg-background px-4 py-12 text-foreground">
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">SWURX Auto</p>
          <h1 className="text-balance text-3xl font-bold">SWURX Rewards</h1>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            Earn 1 point for every AED 1 spent on paid services. Redeem from 1,000 points, where 100 points = AED 1.
          </p>
        </header>
        {!row ? (
          <p className="rounded-lg border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground">
            This link isn&apos;t valid. Please scan the QR code on your latest SWURX invoice or ask our service desk.
          </p>
        ) : row.status === "active" && card ? (
          <section className="flex flex-col gap-5" aria-label="Your SWURX Rewards card">
            <p className="text-lg">{"Welcome back, " + row.first_name + "."}</p>
            <LoyaltyCardVisual
              tier={card.tier}
              name={card.name}
              membershipNumber={card.membershipNumber}
              points={card.points}
            />
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-5">
              <div
                className="rounded-md bg-[#ffffff] p-3"
                role="img"
                aria-label={`QR code for membership ${card.membershipNumber}`}
                dangerouslySetInnerHTML={{ __html: card.qrSvg }}
              />
              <p className="text-center text-sm leading-relaxed text-muted-foreground">
                Show this at the SWURX service desk to collect or redeem points.
              </p>
            </div>
            <LoyaltySaveCard
              name={card.name}
              membershipNumber={card.membershipNumber}
              tier={card.tier}
              points={card.points}
              qrDataUrl={card.qrPng}
            />
            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              Tip: bookmark this page or add it to your home screen to see your live points balance.
            </p>
          </section>
        ) : row.status === "active" ? (
          <p className="rounded-lg border border-border bg-card p-5 text-sm leading-relaxed text-foreground">
            {"You're already a member, " + row.first_name + "."} Membership number{" "}
            <span className="font-mono">{row.membership_number}</span>.
          </p>
        ) : row.status !== "invited" || row.locked ? (
          <p className="rounded-lg border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground">
            This link can no longer be used. Please ask our service desk to help you join.
          </p>
        ) : (
          <>
            <p className="text-lg">{"Hi " + row.first_name + ", confirm it's you to join."}</p>
            <JoinForm token={token} firstName={row.first_name} />
          </>
        )}
      </div>
    </main>
  )
}
