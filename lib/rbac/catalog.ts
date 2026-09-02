// HR catalogs for staff records: job titles, departments and skills.
// Job title is a human-facing label separate from the security Role.
// These drive the Add/Edit User dialogs (searchable dropdowns + free entry).

export interface DepartmentMeta {
  value: string
  label: string
}

export const DEPARTMENTS: DepartmentMeta[] = [
  { value: "management", label: "Management" },
  { value: "front_desk", label: "Front Desk / Reception" },
  { value: "workshop", label: "Workshop" },
  { value: "parts", label: "Parts & Store" },
  { value: "finance", label: "Finance & Accounts" },
  { value: "washing", label: "Washing & Detailing" },
  { value: "quality", label: "Quality Control" },
]

export const DEPARTMENT_MAP: Record<string, string> = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.value, d.label]),
)

export function departmentLabel(value: string | null | undefined): string {
  if (!value) return ""
  return DEPARTMENT_MAP[value] ?? value
}

// Suggested job titles. The dialog lets the user pick one OR type a custom title,
// so this list is a convenience, not a constraint.
export const JOB_TITLE_SUGGESTIONS: string[] = [
  "Owner",
  "General Manager",
  "Workshop Manager",
  "Workshop Supervisor",
  "Foreman",
  "Service Advisor",
  "Senior Service Advisor",
  "Receptionist",
  "Master Technician",
  "Senior Technician",
  "Technician",
  "Junior Technician",
  "Auto Electrician",
  "AC Technician",
  "Denter / Body Repair",
  "Painter",
  "Detailer",
  "Washer",
  "Quality Control Inspector",
  "Parts Manager",
  "Parts Advisor",
  "Storekeeper",
  "Accountant",
  "Cashier",
]

// Suggested skills / specializations for technicians and workshop staff.
export const SKILL_SUGGESTIONS: string[] = [
  "Engine Repair",
  "Engine Overhaul",
  "Transmission",
  "Gearbox / Clutch",
  "Suspension & Steering",
  "Brakes",
  "Air Conditioning",
  "Auto Electrical",
  "Diagnostics / Scanning",
  "ECU Programming",
  "Denting / Bodywork",
  "Painting",
  "Polishing & Detailing",
  "Wheel Alignment",
  "Tyres & Balancing",
  "Battery & Charging",
  "Oil & Periodic Service",
  "Exhaust",
  "Welding",
  "Hybrid / EV Systems",
]

// ---------------- Invite message builders ----------------

export interface InviteMessageInput {
  fullName: string
  jobTitle?: string | null
  roleLabel: string
  link: string
  /** the workshop / company name shown in the message */
  workshopName?: string
  /** "set" for first-time password setup, "reset" for a reset link */
  kind?: "set" | "reset"
}

const DEFAULT_WORKSHOP = "SHWURX Auto Garage"

// A clean, professional WhatsApp message an admin can send to a new staff member.
// Kept plain-text (no markdown) so it renders well inside WhatsApp.
export function buildStaffInviteWhatsApp(input: InviteMessageInput): string {
  const workshop = input.workshopName || DEFAULT_WORKSHOP
  const title = input.jobTitle?.trim() ? input.jobTitle.trim() : input.roleLabel
  const firstName = input.fullName.trim().split(/\s+/)[0] || input.fullName.trim()

  if (input.kind === "reset") {
    return [
      `Hello ${firstName},`,
      ``,
      `A password reset has been requested for your ${workshop} account.`,
      ``,
      `Set a new password using the secure link below:`,
      input.link,
      ``,
      `If you didn't request this, please contact your manager.`,
    ].join("\n")
  }

  return [
    `Hello ${firstName},`,
    ``,
    `Welcome to ${workshop}! An account has been created for you.`,
    ``,
    `Role: ${title}`,
    ``,
    `To get started, set your password using the secure link below:`,
    input.link,
    ``,
    `This link is private — please don't share it. See you at the workshop!`,
  ].join("\n")
}

// Subject + plain body for the staff invite email (used as a manual fallback copy).
export function buildStaffInviteEmail(input: InviteMessageInput): { subject: string; body: string } {
  const workshop = input.workshopName || DEFAULT_WORKSHOP
  const title = input.jobTitle?.trim() ? input.jobTitle.trim() : input.roleLabel
  const isReset = input.kind === "reset"
  const subject = isReset
    ? `Reset your ${workshop} password`
    : `Your ${workshop} account is ready`
  const body = isReset
    ? [
        `Hello ${input.fullName},`,
        ``,
        `A password reset was requested for your ${workshop} account.`,
        `Set a new password here: ${input.link}`,
        ``,
        `If you didn't request this, contact your manager.`,
      ].join("\n")
    : [
        `Hello ${input.fullName},`,
        ``,
        `An account has been created for you at ${workshop}.`,
        `Role: ${title}`,
        ``,
        `Set your password to sign in: ${input.link}`,
        ``,
        `This link is private — please don't share it.`,
      ].join("\n")
  return { subject, body }
}

// Build a wa.me deep link from a UAE-friendly phone number + prefilled message.
export function buildWhatsAppLink(phone: string | null | undefined, message: string): string | null {
  if (!phone) return null
  let digits = phone.replace(/[^\d]/g, "")
  if (!digits) return null
  // Normalize common UAE local formats to international (971).
  if (digits.startsWith("00")) digits = digits.slice(2)
  else if (digits.startsWith("0")) digits = "971" + digits.slice(1)
  else if (digits.length === 9 && digits.startsWith("5")) digits = "971" + digits
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
