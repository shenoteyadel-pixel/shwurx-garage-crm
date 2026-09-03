"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button, Input, Label } from "@/components/ui"
import { Car, ArrowLeft } from "lucide-react"

// CUSTOMER portal login — deliberately separate from the staff /auth/login page.
// It never says "Staff Sign In" and routes customers to their own /portal after
// authentication. Staff and customers use distinct entry points by design.
export default function PortalLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setNotice(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (error) {
      setError(error.message.includes("Invalid") ? "Incorrect email or password." : error.message)
      setLoading(false)
      return
    }
    router.push("/portal")
    router.refresh()
  }

  async function handleForgot() {
    if (!email.trim()) {
      setError("Enter your email above first, then tap Forgot password.")
      return
    }
    setSending(true)
    setError(null)
    setNotice(null)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/set-password`,
    })
    setSending(false)
    if (error) {
      setError(error.message)
      return
    }
    setNotice("If that email has an account, we've sent a password reset link. Please check your inbox.")
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
            <Car className="h-7 w-7 text-primary-foreground" />
          </div>
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-primary">SHWURX Customer Portal</div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-balance">Track your vehicle & service</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to view your repairs, quotations and invoices.</p>
        </div>

        <form onSubmit={handleLogin} className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="mb-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <div className="mb-4 text-right">
            <button
              type="button"
              onClick={handleForgot}
              disabled={sending}
              className="text-xs font-medium text-primary hover:underline disabled:opacity-60"
            >
              {sending ? "Sending…" : "Forgot password?"}
            </button>
          </div>

          {error && <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
          {notice && <p className="mb-4 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">{notice}</p>}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>

          <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
            Just want to check your vehicle status? Use the secure tracking link we sent you — no login needed.
          </p>
        </form>

        <div className="mt-6 text-center">
          <a
            href="/auth/login"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Staff sign in
          </a>
        </div>
      </div>
    </main>
  )
}
