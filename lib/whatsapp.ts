/** Normalize a mobile number to WhatsApp format (digits only, no +). */
export function normalizeMobile(mobile: string) {
  return mobile.replace(/[^\d]/g, "")
}

export function buildApprovalMessage(opts: {
  customerName: string
  jobNumber: string
  vehicle: string
  total: string
  link: string
}) {
  return (
    `Hello ${opts.customerName}, this is SHWURX Auto Service Center.\n\n` +
    `Your quotation for ${opts.vehicle} (Job ${opts.jobNumber}) is ready.\n` +
    `Estimated total: ${opts.total}\n\n` +
    `Please review the photos and quotation and approve or reject here:\n${opts.link}\n\n` +
    `Thank you.`
  )
}

export function waMeLink(mobile: string, message: string) {
  return `https://wa.me/${normalizeMobile(mobile)}?text=${encodeURIComponent(message)}`
}
