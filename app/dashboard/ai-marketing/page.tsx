import { redirect } from "next/navigation"

// CRM routes live at the top level (e.g. /control-center); keep this alias working.
export default function DashboardAiMarketingRedirect() {
  redirect("/ai-marketing")
}
