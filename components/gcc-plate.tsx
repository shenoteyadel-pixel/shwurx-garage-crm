import { cn } from "@/lib/utils"

type PlateProps = {
  emirate?: string | null
  code?: string | null
  number?: string | null
  className?: string
}

const ARABIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"]
const toArabicDigits = (s: string) => s.replace(/[0-9]/g, (d) => ARABIC_DIGITS[Number(d)])

// Saudi plates use 17 fixed letters; each Latin letter has an official Arabic counterpart.
const SAUDI_LETTERS: Record<string, string> = {
  A: "ا", B: "ب", J: "ح", D: "د", R: "ر", S: "س", X: "ص", T: "ط", E: "ع",
  G: "ق", K: "ك", L: "ل", Z: "م", N: "ن", H: "هـ", U: "و", V: "ى",
}
const toSaudiArabic = (s: string) =>
  s
    .toUpperCase()
    .split("")
    .map((c) => SAUDI_LETTERS[c] ?? c)
    .join(" ")

const UAE_NAMES: Record<string, { ar: string; en: string }> = {
  dubai: { ar: "دبي", en: "DUBAI" },
  "abu dhabi": { ar: "أبوظبي", en: "ABU DHABI" },
  sharjah: { ar: "الشارقة", en: "SHARJAH" },
  ajman: { ar: "عجمان", en: "AJMAN" },
  "umm al quwain": { ar: "أم القيوين", en: "U.A.Q" },
  "ras al khaimah": { ar: "رأس الخيمة", en: "R.A.K" },
  fujairah: { ar: "الفجيرة", en: "FUJAIRAH" },
}

const shell =
  "inline-flex items-stretch overflow-hidden rounded-md border-2 border-neutral-800 bg-white font-semibold leading-none text-neutral-900 shadow-sm"

function Stack({ ar, en, className }: { ar: string; en: string; className?: string }) {
  return (
    <span className={cn("flex flex-col items-center justify-center gap-0.5 px-1.5 text-center", className)}>
      <span className="text-[10px] font-bold" lang="ar" dir="rtl">
        {ar}
      </span>
      <span className="text-[7px] font-bold tracking-wider">{en}</span>
    </span>
  )
}

function Num({ children }: { children: React.ReactNode }) {
  return <span className="flex items-center px-2 text-[1.15em] font-bold tracking-wider tabular-nums">{children}</span>
}

function UaePlate({ region, code, number, className }: { region: string; code: string; number: string; className?: string }) {
  const name = UAE_NAMES[region.toLowerCase()] ?? { ar: "الإمارات", en: "UAE" }
  const key = region.toLowerCase()

  if (key === "abu dhabi") {
    return (
      <span className={cn(shell, className)} aria-label={`Abu Dhabi plate ${code} ${number}`}>
        <span className="flex min-w-7 items-center justify-center bg-red-600 px-1.5 text-[1.05em] font-bold text-white">
          {code || "–"}
        </span>
        <Stack ar={name.ar} en={name.en} />
        <Num>{number}</Num>
      </span>
    )
  }

  if (key === "sharjah") {
    return (
      <span className={cn(shell, className)} aria-label={`Sharjah plate ${code} ${number}`}>
        <span className="flex flex-col items-center justify-center bg-orange-500 px-1.5 text-white">
          <span className="text-[10px] font-bold" lang="ar" dir="rtl">
            {name.ar}
          </span>
          <span className="text-[7px] font-bold tracking-wider">{name.en}</span>
        </span>
        {code && <span className="flex items-center pl-2 text-[1.05em] font-bold">{code}</span>}
        <Num>{number}</Num>
      </span>
    )
  }

  if (key === "ras al khaimah") {
    return (
      <span className={cn(shell, className)} aria-label={`Ras Al Khaimah plate ${code} ${number}`}>
        {code && <span className="flex items-center pl-2 text-[1.05em] font-bold">{code}</span>}
        <Num>{number}</Num>
        <Stack ar={name.ar} en={name.en} className="border-l-2 border-red-600 text-red-700" />
      </span>
    )
  }

  // Dubai and the remaining emirates share the white short-plate layout: code · emirate · number.
  return (
    <span className={cn(shell, className)} aria-label={`${region} plate ${code} ${number}`}>
      {code && <span className="flex items-center pl-2 text-[1.05em] font-bold">{code}</span>}
      <Stack ar={name.ar} en={name.en} />
      <Num>{number}</Num>
    </span>
  )
}

function SaudiPlate({ code, number, className }: { code: string; number: string; className?: string }) {
  const cell = "flex items-center justify-center px-2 tabular-nums"
  return (
    <span className={cn(shell, "text-[0.8em]", className)} aria-label={`Saudi plate ${number} ${code}`}>
      <span className="grid grid-cols-2 grid-rows-2">
        <span className={cn(cell, "border-b border-r border-neutral-800")} lang="ar" dir="rtl">
          {toArabicDigits(number)}
        </span>
        <span className={cn(cell, "border-b border-neutral-800")} lang="ar" dir="rtl">
          {toSaudiArabic(code)}
        </span>
        <span className={cn(cell, "border-r border-neutral-800 tracking-wider")}>{number}</span>
        <span className={cn(cell, "tracking-[0.2em]")}>{code.toUpperCase().split("").join(" ")}</span>
      </span>
      <span className="flex flex-col items-center justify-center gap-0.5 border-l-2 border-neutral-800 bg-sky-50 px-1.5 text-sky-800">
        <span className="text-[8px] font-bold" lang="ar" dir="rtl">
          السعودية
        </span>
        <span className="text-[8px] font-bold tracking-wider">KSA</span>
      </span>
    </span>
  )
}

function QatarPlate({ code, number, className }: { code: string; number: string; className?: string }) {
  return (
    <span className={cn(shell, className)} aria-label={`Qatar plate ${code} ${number}`}>
      <span className="flex flex-col items-center justify-center bg-rose-900 px-1.5 text-white">
        <span className="text-[10px] font-bold" lang="ar" dir="rtl">
          قطر
        </span>
        <span className="text-[7px] font-bold tracking-wider">QATAR</span>
      </span>
      {code && <span className="flex items-center pl-2 text-[0.9em] font-bold">{code}</span>}
      <Num>{number}</Num>
    </span>
  )
}

function KuwaitPlate({ code, number, className }: { code: string; number: string; className?: string }) {
  return (
    <span className={cn(shell, className)} aria-label={`Kuwait plate ${code} ${number}`}>
      <span className="flex items-center justify-center border-r-2 border-neutral-800 px-2 text-[1.05em] font-bold tabular-nums">
        {code || "–"}
      </span>
      <Stack ar="الكويت" en="KUWAIT" className="text-sky-800" />
      <Num>{number}</Num>
    </span>
  )
}

function BahrainPlate({ code, number, className }: { code: string; number: string; className?: string }) {
  return (
    <span className={cn(shell, className)} aria-label={`Bahrain plate ${code} ${number}`}>
      <span className="w-1.5 bg-red-600" aria-hidden />
      <Stack ar="البحرين" en="BAHRAIN" className="text-red-700" />
      {code && <span className="flex items-center text-[0.9em] font-bold">{code}</span>}
      <Num>{number}</Num>
    </span>
  )
}

function OmanPlate({ code, number, className }: { code: string; number: string; className?: string }) {
  return (
    <span
      className={cn(shell, "bg-yellow-300", className)}
      aria-label={`Oman plate ${number} ${code}`}
    >
      <Stack ar="عُمان" en="OMAN" className="border-r-2 border-neutral-800 text-red-700" />
      <Num>{number}</Num>
      {code && <span className="flex items-center pr-2 text-[1em] font-bold tracking-wider">{code.toUpperCase()}</span>}
    </span>
  )
}

export function GccPlate({ emirate, code, number, className }: PlateProps) {
  if (!emirate && !code && !number) return null
  const region = (emirate ?? "").trim()
  const c = (code ?? "").trim()
  const n = (number ?? "").trim()
  const key = region.toLowerCase()

  if (key === "saudi arabia" || key === "ksa") return <SaudiPlate code={c} number={n} className={className} />
  if (key === "qatar") return <QatarPlate code={c} number={n} className={className} />
  if (key === "kuwait") return <KuwaitPlate code={c} number={n} className={className} />
  if (key === "bahrain") return <BahrainPlate code={c} number={n} className={className} />
  if (key === "oman") return <OmanPlate code={c} number={n} className={className} />
  return <UaePlate region={region} code={c} number={n} className={className} />
}
