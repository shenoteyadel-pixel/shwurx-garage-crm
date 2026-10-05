/**
 * Telemetry must never carry contact data. A value "looks like contact data"
 * when it contains an email, a URL, or a phone-like digit run of 9+ digits
 * (separators allowed). 8-digit runs stay allowed so date-stamped campaign
 * names such as `sale_20260510` survive.
 */
const EMAIL_OR_URL = /@|%40|https?:|www\.|mailto:|tel:/i
const PHONE_RUN = /\+?\d(?:[\s().-]*\d){8,}/

export function looksLikeContactData(value: string): boolean {
  let v = value
  try {
    v = decodeURIComponent(value)
  } catch {
    /* keep raw */
  }
  return EMAIL_OR_URL.test(v) || PHONE_RUN.test(v)
}
