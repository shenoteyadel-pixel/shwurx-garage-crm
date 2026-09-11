"use client"

import * as React from "react"
import { createClient } from "@/lib/supabase/client"
import { addCarExpense, deleteCarExpense } from "@/lib/actions-expenses"
import { Button, Card, Input, Select } from "@/components/ui"
import { CAR_EXPENSE_CATEGORIES, carExpenseCategoryLabel } from "@/lib/expenses"
import { formatCurrency, formatDate, cn } from "@/lib/utils"
import { Plus, Trash2, Wallet, Loader2, Paperclip, X, FileWarning, ReceiptText } from "lucide-react"

export type CarExpense = {
  id: string
  category: string
  description: string | null
  amount: number
  vendor: string | null
  has_invoice: boolean
  reference: string | null
  receipt_url: string | null
  expense_date: string
}

export function CarExpensesManager({
  jobId,
  expenses,
  canManage = false,
}: {
  jobId: string
  expenses: CarExpense[]
  canManage?: boolean
}) {
  const [adding, setAdding] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [hasInvoice, setHasInvoice] = React.useState(false)
  const [receiptUrl, setReceiptUrl] = React.useState<string | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const total = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

  function resetForm() {
    setAdding(false)
    setHasInvoice(false)
    setReceiptUrl(null)
    setError(null)
  }

  async function handleReceipt(files: FileList | null) {
    if (!files || !files.length) return
    setUploading(true)
    setError(null)
    try {
      const file = files[0]
      const supabase = createClient()
      const ext = file.name.split(".").pop() || "jpg"
      const path = `expenses/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from("vehicle-photos")
        .upload(path, file, { cacheControl: "3600", upsert: false })
      if (upErr) throw upErr
      const { data } = supabase.storage.from("vehicle-photos").getPublicUrl(path)
      setReceiptUrl(data.publicUrl)
    } catch {
      setError("Could not upload the receipt. Try again.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Wallet className="h-4 w-4" /> Car Expenses
        </h2>
        {canManage && (
          <Button type="button" variant="outline" size="sm" onClick={() => (adding ? resetForm() : setAdding(true))}>
            <Plus className="h-3.5 w-3.5" /> Add expense
          </Button>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
      )}

      {adding && canManage && (
        <form
          action={async (fd) => {
            setSaving(true)
            setError(null)
            try {
              if (receiptUrl) fd.set("receipt_url", receiptUrl)
              fd.set("has_invoice", hasInvoice ? "true" : "false")
              await addCarExpense(jobId, fd)
              resetForm()
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not save the expense.")
            } finally {
              setSaving(false)
            }
          }}
          className="mb-4 grid gap-2 rounded-lg border border-border bg-background/40 p-3 sm:grid-cols-2"
        >
          <Select name="category" defaultValue="towing" className="sm:col-span-1">
            {CAR_EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
          <Input name="amount" type="number" min="0" step="0.01" required placeholder="Amount" />
          <Input name="vendor" placeholder="Paid to / vendor" />
          <Input name="expense_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          <Input name="description" placeholder="Description" className="sm:col-span-2" />

          <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
            <input
              type="checkbox"
              checked={hasInvoice}
              onChange={(e) => setHasInvoice(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            This expense has an invoice / official receipt
          </label>

          {hasInvoice && (
            <Input name="reference" placeholder="Invoice / receipt number" className="sm:col-span-2" />
          )}

          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary hover:text-primary">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
              {receiptUrl ? "Replace receipt photo" : "Attach receipt photo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleReceipt(e.target.files)}
              />
            </label>
            {receiptUrl && (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
                <ReceiptText className="h-3.5 w-3.5" /> Attached
                <button
                  type="button"
                  onClick={() => setReceiptUrl(null)}
                  className="text-muted-foreground hover:text-red-400"
                  aria-label="Remove receipt"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>

          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving || uploading}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save expense
            </Button>
          </div>
        </form>
      )}

      {expenses.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No expenses recorded for this car yet.</p>
      ) : (
        <>
          <div className="space-y-2">
            {expenses.map((e) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background/40 p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{carExpenseCategoryLabel(e.category)}</span>
                    {!e.has_invoice && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                        <FileWarning className="h-3 w-3" /> No invoice
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {formatDate(e.expense_date)}
                    {e.vendor ? ` · ${e.vendor}` : ""}
                    {e.reference ? ` · ${e.reference}` : ""}
                    {e.description ? ` · ${e.description}` : ""}
                  </div>
                </div>
                {e.receipt_url && (
                  <a
                    href={e.receipt_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-primary"
                    aria-label="View receipt"
                  >
                    <Paperclip className="h-4 w-4" />
                  </a>
                )}
                <span className="font-semibold tabular-nums">{formatCurrency(e.amount)}</span>
                {canManage && (
                  <form action={deleteCarExpense.bind(null, e.id, jobId)}>
                    <button
                      type="submit"
                      className="text-muted-foreground hover:text-red-400"
                      aria-label="Delete expense"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
            <span className="text-muted-foreground">
              {expenses.length} expense{expenses.length === 1 ? "" : "s"}
            </span>
            <span className="font-semibold tabular-nums">{formatCurrency(total)}</span>
          </div>
        </>
      )}
    </Card>
  )
}
