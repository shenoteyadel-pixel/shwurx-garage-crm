import Link from "next/link"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { CustomerForm } from "@/components/customer-form"
import { ArrowLeft } from "lucide-react"

export const metadata = { title: "New Customer · SHWURX Auto Service Center" }

export default async function NewCustomerPage() {
  const user = await getShellUser()
  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-3xl">
        <Link
          href="/customers"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to customers
        </Link>
        <h1 className="mb-6 text-2xl font-bold tracking-tight">New Customer</h1>
        <CustomerForm />
      </div>
    </AppShell>
  )
}
