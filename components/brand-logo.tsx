import { cn } from "@/lib/utils"

export const LOGO_DARK = "/brand/shwurx-logo.png"
export const LOGO_INK = "/brand/shwurx-logo-ink.png"

/** SHWURX logo: chrome lettering on dark UI, ink lettering on light UI and paper. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LOGO_DARK}
        alt="SHWURX Auto Service Center"
        className={cn("hidden w-auto object-contain dark:block", className ?? "h-10")}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LOGO_INK}
        alt="SHWURX Auto Service Center"
        className={cn("block w-auto object-contain dark:hidden", className ?? "h-10")}
      />
    </>
  )
}
