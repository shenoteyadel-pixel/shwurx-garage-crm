"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui"
import { createMissingTechnicianTasks } from "@/lib/actions-technician"

export function CreateMissingTasksButton({ count }: { count: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span role="status" className="text-sm text-muted-foreground">
          {message}
        </span>
      )}
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await createMissingTechnicianTasks()
            setMessage(res.ok ? `Created ${res.created} task${res.created === 1 ? "" : "s"}.` : res.error)
            router.refresh()
          })
        }
      >
        {pending ? "Creating..." : `Create ${count} task${count === 1 ? "" : "s"}`}
      </Button>
    </div>
  )
}
