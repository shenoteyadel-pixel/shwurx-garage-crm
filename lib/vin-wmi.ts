/**
 * Offline VIN baseline decoder — no network, no API quota.
 *
 * A standard 17-character VIN deterministically encodes:
 *  - the manufacturer, in the World Manufacturer Identifier (first 3 chars), and
 *  - the model year, in position 10,
 * per the ISO 3779 / SAE VIN standard. This lets us always fill in at least the
 * make and year for a well-formed VIN even when the paid decode service is
 * unavailable or over quota. It is real standards data, not a guess.
 *
 * We intentionally keep this conservative: only makes we can map with certainty,
 * and a model year resolved to the most recent plausible value.
 */

// World Manufacturer Identifier prefixes → canonical make.
// Keyed by the 3-character WMI; a few high-volume makers also get a 2-char
// fallback because they span many 3-char WMIs.
const WMI3: Record<string, string> = {
  // German
  WAU: "Audi", WA1: "Audi", WUA: "Audi", TRU: "Audi", WU1: "Audi",
  WVW: "Volkswagen", WV1: "Volkswagen", WV2: "Volkswagen", WVG: "Volkswagen", "1VW": "Volkswagen", "3VW": "Volkswagen",
  WBA: "BMW", WBS: "BMW", WBY: "BMW", WBX: "BMW", "4US": "BMW", "5UX": "BMW", "5YM": "BMW",
  WDB: "Mercedes-Benz", WDD: "Mercedes-Benz", WDC: "Mercedes-Benz", WDF: "Mercedes-Benz",
  W1K: "Mercedes-Benz", W1N: "Mercedes-Benz", W1V: "Mercedes-Benz", "4JG": "Mercedes-Benz", "55S": "Mercedes-Benz",
  WP0: "Porsche", WP1: "Porsche",
  WMW: "MINI", WMX: "MINI",
  // Italian / exotic
  ZFF: "Ferrari", ZFR: "Ferrari",
  ZHW: "Lamborghini",
  ZAM: "Maserati", ZAR: "Alfa Romeo",
  // British
  SCA: "Rolls-Royce", SCB: "Bentley", SCF: "Aston Martin", SCC: "Lotus", SCE: "Lotus",
  SAL: "Land Rover", SAJ: "Jaguar", SAR: "Rover",
  SDB: "Peugeot",
  // Swedish
  YV1: "Volvo", YV4: "Volvo", "7JR": "Volvo",
  // Japanese
  JTJ: "Lexus", "2T2": "Lexus", "5TA": "Toyota",
  JHM: "Honda", "1HG": "Honda", "2HG": "Honda", "19U": "Acura", "19V": "Acura", JH4: "Acura",
  JF1: "Subaru", JF2: "Subaru", "4S3": "Subaru", "4S4": "Subaru",
  JM1: "Mazda", JM3: "Mazda", "3MZ": "Mazda",
  JN1: "Nissan", JN6: "Nissan", JN8: "Nissan", "1N4": "Nissan", "1N6": "Nissan", "3N1": "Nissan", "5N1": "Nissan", SJN: "Nissan", JNK: "Infiniti", JNX: "Infiniti",
  // Korean
  KMH: "Hyundai", KMF: "Hyundai", KM8: "Hyundai", "5NP": "Hyundai", "5NM": "Hyundai",
  KNA: "Kia", KND: "Kia", KNM: "Kia", "3KP": "Kia", "5XY": "Kia",
  // American
  "1FA": "Ford", "1FT": "Ford", "1FM": "Ford", "1FD": "Ford", "2FA": "Ford", "3FA": "Ford",
  "1G1": "Chevrolet", "1GC": "Chevrolet", "2G1": "Chevrolet", "3GC": "Chevrolet", "1GN": "Chevrolet", "1GT": "GMC",
  "1C3": "Chrysler", "1C4": "Chrysler", "2C3": "Chrysler", "1C6": "Ram",
  "1J4": "Jeep", "1J8": "Jeep",
  "5YJ": "Tesla", "7SA": "Tesla",
  // French
  VF1: "Renault", VF3: "Peugeot", VF7: "Citroën", VF6: "Renault", VR1: "DS", VR7: "DS",
}

// Broad 2-character fallbacks for makers spanning many WMIs.
const WMI2: Record<string, string> = {
  JT: "Toyota",
  JN: "Nissan",
  JF: "Subaru",
  JM: "Mazda",
  JH: "Honda",
  WP: "Porsche",
  ZF: "Ferrari",
  SC: "", // ambiguous (Bentley/Rolls/Aston) — leave to WMI3 only
}

// Position-10 model-year codes, in cycle order starting at 1980.
const YEAR_CODES = [
  "A", "B", "C", "D", "E", "F", "G", "H", "J", "K",
  "L", "M", "N", "P", "R", "S", "T", "V", "W", "X",
  "Y", "1", "2", "3", "4", "5", "6", "7", "8", "9",
]

export function normalizeVin(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, "")
}

/** Manufacturer from the WMI, or null if we can't map it with confidence. */
export function wmiToMake(vin: string): string | null {
  const v = normalizeVin(vin)
  if (v.length < 3) return null
  const three = v.slice(0, 3)
  if (WMI3[three]) return WMI3[three]
  const two = v.slice(0, 2)
  if (WMI2[two]) return WMI2[two] || null
  return null
}

/**
 * Model year from VIN position 10, resolved to the most recent plausible year.
 * Position 7 disambiguates the 30-year cycle for cars (letter => 2010+,
 * digit => 1980–2009), but we also cap at next year to stay sane.
 */
export function vinModelYear(vin: string): number | null {
  const v = normalizeVin(vin)
  if (v.length < 10) return null
  const code = v[9]
  const offset = YEAR_CODES.indexOf(code)
  if (offset < 0) return null

  const nextYear = new Date().getFullYear() + 1
  // Candidate years share the same code every 30 years (1980, 2010, 2040…).
  const candidates: number[] = []
  for (let base = 1980; base <= nextYear; base += 30) candidates.push(base + offset)

  // Position 7: a letter indicates the newer (2010+) cycle for passenger cars.
  const pos7 = v[6]
  const isNewCycle = /[A-Z]/.test(pos7 ?? "")

  const plausible = candidates.filter((y) => y <= nextYear)
  if (plausible.length === 0) return null
  if (isNewCycle) {
    const modern = plausible.filter((y) => y >= 2010)
    if (modern.length) return Math.max(...modern)
  }
  return Math.max(...plausible)
}

export type OfflineVinBaseline = {
  make: string | null
  year: number | null
}

/** Deterministic make + year from a well-formed VIN. Empty when not derivable. */
export function decodeVinOffline(vin: string): OfflineVinBaseline {
  const v = normalizeVin(vin)
  // Only trust the standard positional encoding for full 17-char VINs.
  if (v.length !== 17) return { make: null, year: null }
  return { make: wmiToMake(v), year: vinModelYear(v) }
}
