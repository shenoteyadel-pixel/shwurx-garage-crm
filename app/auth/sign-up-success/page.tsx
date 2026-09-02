import Link from "next/link"
import { MailCheck } from "lucide-react"

export default function SignUpSuccessPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15">
          <MailCheck className="h-7 w-7 text-emerald-400" />
        </div>
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We sent a confirmation link to activate your staff account. Confirm it, then sign in.
        </p>
        <Link
          href="/auth/login"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  )
}
