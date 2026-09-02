"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { markPasswordSet } from "@/lib/actions-users"
import { Button, Input, Label } from "@/components/ui"
import { Wrench, CheckCircle2 } from "lucide-react"

export default function SetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()
  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session)
      setChecking(false)
    })
  }, [supabase])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }
    setLoading(true)
    const { error: updErr } = await supabase.auth.updateUser({ data: { must_set_password: false }, password })
    if (updErr) {
      setError(updErr.message)
      setLoading(false)
      return
    }
    // Record acceptance server-side and get the user's role landing page.
    let home = "/"
    try {
      const res = await markPasswordSet()
      home = res.home
    } catch {
      /* non-fatal: fall back to root, which re-routes by role */
    }
    setDone(true)
    setTimeout(() => router.replace(home), 1400)
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wrench className="h-5 w-5" />
          </span>
          <span className="text-lg font-semibold text-foreground">Shwurx Garage</span>
        </div>

        {checking ? (
          <p className="text-sm text-muted-foreground">Verifying your link…</p>
        ) : done ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="h-10 w-10 text-primary" />
            <p className="text-sm text-foreground">Password set. Signing you in…</p>
          </div>
        ) : !hasSession ? (
          <div className="space-y-3">
            <h1 className="text-lg font-semibold text-foreground">Link expired or invalid</h1>
            <p className="text-sm text-muted-foreground">
              This set-password link is no longer valid. Ask an administrator to resend your invite, or use
              &quot;Forgot password&quot; on the login page.
            </p>
            <Button className="w-full" onClick={() => router.replace("/auth/login")}>
              Go to login
            </Button>
          </div>
        ) : (
          <>
            <h1 className="mb-1 text-lg font-semibold text-foreground">Choose your password</h1>
            <p className="mb-5 text-sm text-muted-foreground">Set a password to finish activating your account.</p>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  required
                />
              </div>
              <div>
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Saving…" : "Set password & continue"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
