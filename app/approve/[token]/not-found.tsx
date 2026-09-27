import { BrandLogo } from "@/components/brand-logo"

export default function ApproveNotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4 text-center">
      <div className="mb-4">
        <BrandLogo className="h-14" />
      </div>
      <h1 className="text-xl font-bold">Link not found</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        This approval link is invalid or has expired. Please contact SHWURX Auto Service Center for an updated link.
      </p>
    </div>
  )
}
