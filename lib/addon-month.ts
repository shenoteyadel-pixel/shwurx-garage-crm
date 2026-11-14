/** Parses `YYYY-MM` (defaulting to the current month) into an ISO [from, to) range. */
export function monthRange(month: string | undefined) {
  const now = new Date()
  const valid = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
  const [y, m] = valid ? month!.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1]
  const pad = (n: number) => String(n).padStart(2, "0")
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`
  return { month: `${y}-${pad(m)}`, from: `${y}-${pad(m)}-01`, to: next }
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Inclusive `from`/`to` days from the query string (defaults to the current month),
 * plus the exclusive `toExclusive` bound used for timestamp queries.
 */
export function dayRange(params: { from?: string; to?: string; month?: string }) {
  const month = monthRange(params.month)
  let from = params.from && ISO_DAY.test(params.from) ? params.from : month.from
  let to = params.to && ISO_DAY.test(params.to) ? params.to : addDays(month.to, -1)
  if (to < from) [from, to] = [to, from]
  return { from, to, toExclusive: addDays(to, 1) }
}

export function presetRanges(today = new Date()) {
  const t = today.toISOString().slice(0, 10)
  const monthStart = `${t.slice(0, 7)}-01`
  const dow = (today.getUTCDay() + 6) % 7
  return [
    { label: "Today", from: t, to: t },
    { label: "This week", from: addDays(t, -dow), to: t },
    { label: "This month", from: monthStart, to: t },
    { label: "Last 30 days", from: addDays(t, -29), to: t },
  ]
}
