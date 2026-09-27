import { cn } from "@/lib/utils"

/** WURX logo that swaps between the silver (dark UI) and ink (light UI) versions. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/wurx-logo.png"
        alt="WURX Auto Service Center"
        className={cn("hidden w-auto object-contain dark:block", className ?? "h-10")}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/wurx-logo-ink.png"
        alt="WURX Auto Service Center"
        className={cn("block w-auto object-contain dark:hidden", className ?? "h-10")}
      />
    </>
  )
}
