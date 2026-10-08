"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui"
import { CrmModal } from "@/components/crm/crm-modal"
import { removeVehicleFromCustomer } from "@/lib/actions-customers"

export function RemoveVehicleButton({
  vehicleId,
  customerId,
  label,
}: {
  vehicleId: string
  customerId: string
  label: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const confirm = () =>
    start(async () => {
      setError(null)
      const res = await removeVehicleFromCustomer(vehicleId, customerId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setOpen(false)
      router.refresh()
    })

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        aria-label={`Remove ${label} from customer`}
        title="Remove vehicle (sold)"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <CrmModal open={open} onClose={() => !pending && setOpen(false)} title="Remove vehicle from customer?" closeLabel="Close">
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-foreground">
            <span className="font-medium">{label}</span> will be removed from this customer&apos;s profile.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            If the car has past job cards, they are kept in history and the car is only unlinked from this
            customer. If it has no jobs, it is deleted.
          </p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirm} disabled={pending}>
              {pending ? "Removing…" : "Remove vehicle"}
            </Button>
          </div>
        </div>
      </CrmModal>
    </>
  )
}
