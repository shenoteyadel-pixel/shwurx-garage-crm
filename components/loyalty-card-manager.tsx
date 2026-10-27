"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Button, Card, Input, Select, Textarea } from "@/components/ui"
import { formatCurrency } from "@/lib/utils"
import {
  adjustCardPoints,
  saveCardNote,
  setCardStatus,
  setCardTier,
  unlockCard,
} from "@/lib/actions-loyalty-cards"

type Msg = { kind: "ok" | "error"; text: string } | null

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "invited", label: "Not joined yet" },
  { value: "suspended", label: "Suspended (no points earned)" },
  { value: "closed", label: "Closed" },
]

export function LoyaltyCardManager({
  membershipId,
  status,
  tier,
  tierOverride,
  note,
  locked,
  joinUrl,
  thresholds,
}: {
  membershipId: string
  status: string
  tier: string
  tierOverride: string | null
  note: string
  locked: boolean
  joinUrl: string | null
  thresholds: { silver: number; vip: number }
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<Msg>(null)

  const [tierChoice, setTierChoice] = useState(tierOverride ?? "auto")
  const [statusChoice, setStatusChoice] = useState(status)
  const [direction, setDirection] = useState<"add" | "remove">("add")
  const [points, setPoints] = useState("")
  const [reason, setReason] = useState("")
  const [noteText, setNoteText] = useState(note)
  const [adjustKey, setAdjustKey] = useState(() => crypto.randomUUID())

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) {
    setMsg(null)
    startTransition(async () => {
      const res = await action()
      if (res.ok) {
        setMsg({ kind: "ok", text: success })
        after?.()
        router.refresh()
      } else {
        setMsg({ kind: "error", text: res.error ?? "Something went wrong." })
      }
    })
  }

  function saveTier() {
    const value = tierChoice === "auto" ? null : tierChoice
    run(() => setCardTier(membershipId, value), value ? "Tier updated." : "Tier is automatic again.")
  }

  function saveStatus() {
    if (statusChoice === "closed" && !window.confirm("Close this card? The customer will stop earning points.")) return
    setMsg(null)
    startTransition(async () => {
      const res = await setCardStatus(membershipId, statusChoice)
      if (res.ok) {
        setMsg({
          kind: "ok",
          text: res.data > 0 ? `Status saved. ${res.data.toLocaleString("en-AE")} points added from past invoices.` : "Status saved.",
        })
        router.refresh()
      } else setMsg({ kind: "error", text: res.error })
    })
  }

  function saveAdjustment() {
    const n = Math.trunc(Number(points))
    if (!n || n < 0) {
      setMsg({ kind: "error", text: "Enter a positive whole number of points." })
      return
    }
    const signed = direction === "add" ? n : -n
    run(
      () => adjustCardPoints(membershipId, signed, reason, adjustKey),
      `${direction === "add" ? "Added" : "Removed"} ${n.toLocaleString("en-AE")} points.`,
      () => {
        setPoints("")
        setReason("")
        setAdjustKey(crypto.randomUUID())
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {msg ? (
        <p
          role="status"
          className={`rounded-lg border px-3 py-2 text-sm ${msg.kind === "ok" ? "border-primary/40 text-primary" : "border-destructive/40 text-destructive"}`}
        >
          {msg.text}
        </p>
      ) : null}

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold">Tier</h2>
          <p className="text-xs text-muted-foreground text-pretty">
            Automatic uses 12-month spend: Silver from {formatCurrency(thresholds.silver)}, VIP from {formatCurrency(thresholds.vip)}.
            Choosing a tier keeps it fixed until you set it back to Automatic.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="tier-select" className="sr-only">
            Tier
          </label>
          <Select id="tier-select" value={tierChoice} onChange={(e) => setTierChoice(e.target.value)} className="sm:flex-1">
            <option value="auto">Automatic (currently {tier === "vip" ? "VIP" : tier === "silver" ? "Silver" : "Member"})</option>
            <option value="member">Member (1x points)</option>
            <option value="silver">Silver (1.25x points)</option>
            <option value="vip">VIP (1.5x points)</option>
          </Select>
          <Button onClick={saveTier} disabled={pending || tierChoice === (tierOverride ?? "auto")}>
            Save tier
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="font-semibold">Status</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="status-select" className="sr-only">
            Status
          </label>
          <Select id="status-select" value={statusChoice} onChange={(e) => setStatusChoice(e.target.value)} className="sm:flex-1">
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Button onClick={saveStatus} disabled={pending || statusChoice === status}>
            Save status
          </Button>
        </div>
        {status === "invited" ? (
          <p className="text-xs text-muted-foreground text-pretty">
            Setting a card to Active here joins the customer without scanning, and adds points for paid invoices from the last 12 months.
          </p>
        ) : null}
        {locked ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2">
            <p className="text-xs text-destructive">Locked after 5 wrong mobile-number attempts on the join page.</p>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(() => unlockCard(membershipId), "Card unlocked. The customer can try again.")}
            >
              Unlock
            </Button>
          </div>
        ) : null}
        {joinUrl ? (
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Join link to send the customer:</p>
            <div className="flex gap-2">
              <Input readOnly value={joinUrl} aria-label="Join link" className="font-mono text-xs" onFocus={(e) => e.target.select()} />
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard?.writeText(joinUrl)
                  setMsg({ kind: "ok", text: "Join link copied." })
                }}
              >
                Copy
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold">Add or remove points</h2>
          <p className="text-xs text-muted-foreground">Saved with your name and reason in the audit log.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="adjust-direction" className="sr-only">
            Add or remove
          </label>
          <Select
            id="adjust-direction"
            value={direction}
            onChange={(e) => setDirection(e.target.value as "add" | "remove")}
            className="sm:w-36"
          >
            <option value="add">Add</option>
            <option value="remove">Remove</option>
          </Select>
          <label htmlFor="adjust-points" className="sr-only">
            Points
          </label>
          <Input
            id="adjust-points"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            placeholder="Points"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            className="sm:w-36"
          />
          <label htmlFor="adjust-reason" className="sr-only">
            Reason
          </label>
          <Input
            id="adjust-reason"
            placeholder="Reason (required)"
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
            className="sm:flex-1"
          />
        </div>
        <Button onClick={saveAdjustment} disabled={pending || !points || reason.trim().length < 5} className="sm:self-end">
          {direction === "add" ? "Add points" : "Remove points"}
        </Button>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="font-semibold">Owner note</h2>
        <label htmlFor="owner-note" className="sr-only">
          Owner note
        </label>
        <Textarea
          id="owner-note"
          rows={3}
          maxLength={500}
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Private note, only visible to the owner"
        />
        <Button
          variant="outline"
          className="sm:self-end"
          disabled={pending || noteText === note}
          onClick={() => run(() => saveCardNote(membershipId, noteText), "Note saved.")}
        >
          Save note
        </Button>
      </Card>
    </div>
  )
}
