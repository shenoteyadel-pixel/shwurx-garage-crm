"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui"
import { issuePortalToken, revokePortalTokens } from "@/lib/actions-portal"
import { inviteCustomerToPortal } from "@/lib/actions-customer-portal"
import { CredentialLinkPanel } from "@/components/admin/credential-link-panel"
import type { CredentialLinkResult } from "@/lib/actions-users"
import { Share2, Copy, Check, Ban, UserPlus, Link2, Loader2, X } from "lucide-react"

export function PortalLinkButton({
  customerId,
  hasEmail,
  hasAccount,
  phone,
}: {
  customerId: string
  hasEmail?: boolean
  hasAccount?: boolean
  phone?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()

  // Real-account invite result
  const [cred, setCred] = useState<CredentialLinkResult | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)

  // Token fallback link
  const [tokenUrl, setTokenUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function invite() {
    setInviteError(null)
    start(async () => {
      try {
        const r = await inviteCustomerToPortal(customerId)
        setCred(r)
        setTokenUrl(null)
      } catch (e) {
        setInviteError((e as Error).message)
      }
    })
  }

  function generateToken() {
    start(async () => {
      const { path } = await issuePortalToken(customerId)
      setTokenUrl(`${window.location.origin}${path}`)
      setCred(null)
      setCopied(false)
    })
  }

  function revoke() {
    start(async () => {
      await revokePortalTokens(customerId)
      setTokenUrl(null)
    })
  }

  async function copyToken() {
    if (!tokenUrl) return
    await navigator.clipboard.writeText(tokenUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function close() {
    setOpen(false)
    setCred(null)
    setTokenUrl(null)
    setInviteError(null)
  }

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <Share2 className="h-4 w-4" /> Customer access
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-96 rounded-xl border border-border bg-card p-4 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Customer portal access</h3>
            <button onClick={close} aria-label="Close" className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {cred ? (
            <CredentialLinkPanel result={cred} purpose="invite" phone={phone} />
          ) : tokenUrl ? (
            <div className="rounded-xl border border-border bg-secondary/40 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Read-only tracking link (no login, valid 30 days).
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={tokenUrl}
                  className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                />
                <Button size="sm" onClick={copyToken}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <button
                onClick={revoke}
                disabled={pending}
                className="mt-3 inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
              >
                <Ban className="h-3.5 w-3.5" /> Revoke all token links
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="rounded-lg border border-border p-3">
                <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                  <UserPlus className="h-4 w-4 text-primary" />
                  {hasAccount ? "Re-send account link" : "Invite to portal account"}
                </div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Creates a real login and emails a secure set-password link. Requires an email on file.
                </p>
                <Button size="sm" onClick={invite} disabled={pending || !hasEmail}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  {hasAccount ? "Send reset link" : "Create & invite"}
                </Button>
                {!hasEmail && <p className="mt-2 text-xs text-amber-400">Add an email to this customer first.</p>}
                {inviteError && <p className="mt-2 text-xs text-destructive">{inviteError}</p>}
              </div>

              <div className="rounded-lg border border-border p-3">
                <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                  <Link2 className="h-4 w-4 text-muted-foreground" /> Quick tracking link
                </div>
                <p className="mb-2 text-xs text-muted-foreground">
                  No login needed — a read-only link to share on WhatsApp.
                </p>
                <Button size="sm" variant="outline" onClick={generateToken} disabled={pending}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  Generate link
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
