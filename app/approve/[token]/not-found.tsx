import { Wrench } from "lucide-react"

export default function ApproveNotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
        <Wrench className="h-6 w-6 text-primary-foreground" />
      </div>
      <h1 className="text-xl font-bold">Link not found</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        This approval link is invalid or has expired. Please contact SHWURX Auto Service Center for an updated link.
      </p>
    </div>
  )
}
