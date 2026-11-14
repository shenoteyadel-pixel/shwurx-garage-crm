/** Parses `YYYY-MM` (defaulting to the current month) into an ISO [from, to) range. */
export function monthRange(month: string | undefined) {
  const now = new Date()
  const valid = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
  const [y, m] = valid ? month!.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1]
  const pad = (n: number) => String(n).padStart(2, "0")
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`
  return { month: `${y}-${pad(m)}`, from: `${y}-${pad(m)}-01`, to: next }
}
