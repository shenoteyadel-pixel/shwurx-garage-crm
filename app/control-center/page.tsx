import { requireOwner } from "@/lib/rbac/context"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { Card } from "@/components/ui"
import { runAnalysis } from "@/lib/ai/analysis"
import { ControlCenterHeader } from "@/components/control-center/header-bar"
import { AskShwurx } from "@/components/control-center/ask-shwurx"
import {
  ScoreHero,
  Priorities,
  MoneyOverview,
  Profitability,
  Pipeline,
  FindingsByCategory,
} from "@/components/control-center/panels"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "AI Control Center · SHWURX",
  description: "Owner-only AI analysis of the entire workshop business.",
}

export default async function ControlCenterPage() {
  // Strictly owner-only: exposes profit, margins and supplier costs.
  await requireOwner()
  const shellUser = await getShellUser()

  let analysis
  let failed = false
  try {
    analysis = await runAnalysis()
  } catch (err) {
    console.log("[v0] runAnalysis failed:", (err as Error)?.message)
    failed = true
  }

  return (
    <AppShell user={shellUser}>
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        {analysis && <ControlCenterHeader generatedAt={analysis.generatedAt} />}

        {failed || !analysis ? (
          <Card className="p-6">
            <h1 className="text-lg font-semibold">AI Control Center</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The analysis could not be generated right now. Please try again in a moment.
            </p>
          </Card>
        ) : (
          <>
            <ScoreHero analysis={analysis} />

            <div className="grid gap-5 lg:grid-cols-2">
              <Priorities findings={analysis.priorities} />
              <AskShwurx />
            </div>

            <MoneyOverview analysis={analysis} />

            <div className="grid gap-5">
              <Profitability analysis={analysis} />
              <Pipeline analysis={analysis} />
            </div>

            <FindingsByCategory findings={analysis.findings} />
          </>
        )}
      </div>
    </AppShell>
  )
}
