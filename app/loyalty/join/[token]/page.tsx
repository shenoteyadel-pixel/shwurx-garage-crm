import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { JoinForm } from "./join-form"

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
