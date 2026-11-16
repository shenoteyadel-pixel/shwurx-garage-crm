import { NextResponse, type NextRequest } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { runTaskEscalation } from "@/lib/task-escalation"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    return NextResponse.json(await runTaskEscalation())
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
