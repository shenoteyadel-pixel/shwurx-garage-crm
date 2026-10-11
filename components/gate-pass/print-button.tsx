"use client"

import { Printer } from "lucide-react"
import { Button } from "@/components/ui"

export function PrintButton() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()} className="print:hidden">
      <Printer className="h-4 w-4" aria-hidden />
      Print / Save PDF
    </Button>
  )
}
