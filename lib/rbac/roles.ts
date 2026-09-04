// Central RBAC role + permission catalog.
// This mirrors the DB tables (role_permissions / permission_overrides) and the
// SQL helper functions. The DB is the source of truth for enforcement; these
// constants drive UI, labels, and the editable admin matrix.

export type Role =
  | "owner"
  | "general_manager"
  | "workshop_manager"
  | "workshop_supervisor"
  | "service_advisor"
  | "reception"
  | "technician"
  | "qc"
  | "parts_manager"
  | "parts"
  | "parts_staff"
  | "finance"
  | "washing"
  | "viewer"
  | "customer"

export interface RoleMeta {
  value: Role
  label: string
  description: string
  /** default landing route after login */
  home: string
  /** staff roles appear in the staff user picker; customer is portal-only */
  staff: boolean
}

export const ROLE_LIST: RoleMeta[] = [
  { value: "owner", label: "Owner / Super Admin", description: "Full access to everything, including users, permissions and settings.", home: "/", staff: true },
  { value: "general_manager", label: "General Manager", description: "Full operational access; cannot edit the permission matrix.", home: "/", staff: true },
  { value: "workshop_manager", label: "Workshop Manager", description: "Runs the workshop: creates and assigns job cards, manages technicians and job flow.", home: "/flow", staff: true },
  { value: "workshop_supervisor", label: "Workshop Supervisor", description: "Assigns and manages workshop jobs and technicians.", home: "/flow", staff: true },
  { value: "service_advisor", label: "Service Advisor", description: "Front desk: customers, vehicles, job cards, quotations and invoicing.", home: "/", staff: true },
  { value: "reception", label: "Reception", description: "Front desk intake: registers customers, vehicles and opens job cards.", home: "/", staff: true },
  { value: "technician", label: "Technician", description: "Works on assigned jobs and updates their status. No prices or invoices.", home: "/jobs", staff: true },
  { value: "qc", label: "Quality Control (QC)", description: "Inspects completed work and updates job status. No prices.", home: "/flow", staff: true },
  { value: "parts_manager", label: "Parts Manager", description: "Full parts control: inventory, parts requests and purchase orders.", home: "/parts", staff: true },
  { value: "parts", label: "Parts / Store", description: "Manages inventory, parts requests and purchase orders.", home: "/parts", staff: true },
  { value: "parts_staff", label: "Parts Staff", description: "Handles parts and inventory. No purchasing or reports.", home: "/parts", staff: true },
  { value: "finance", label: "Finance / Accounts", description: "Invoices, payments and financial reports. No workshop edits.", home: "/invoices", staff: true },
  { value: "washing", label: "Washing / Detailing", description: "Works on assigned wash jobs and updates their status.", home: "/", staff: true },
  { value: "viewer", label: "Viewer (Read-only)", description: "Read-only visibility across the CRM.", home: "/", staff: true },
  { value: "customer", label: "Customer", description: "Portal access to own vehicles, jobs and invoices only.", home: "/portal", staff: false },
]

export const ROLE_MAP: Record<string, RoleMeta> = Object.fromEntries(
  ROLE_LIST.map((r) => [r.value, r]),
)

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "Unknown"
  return ROLE_MAP[role]?.label ?? role
}

export function roleHome(role: string | null | undefined): string {
  if (!role) return "/"
  return ROLE_MAP[role]?.home ?? "/"
}

// ---------------- Permissions ----------------

export type Permission =
  | "customers.view" | "customers.create" | "customers.edit" | "customers.delete"
  | "vehicles.view" | "vehicles.create" | "vehicles.edit" | "vehicles.transfer" | "vehicles.delete"
  | "jobs.view_all" | "jobs.view_assigned" | "jobs.create" | "jobs.edit" | "jobs.update_status" | "jobs.assign" | "jobs.delete"
  | "quotations.view" | "quotations.create" | "quotations.edit" | "quotations.approve"
  | "invoices.view" | "invoices.create" | "invoices.edit"
  | "payments.view" | "payments.record"
  | "prices.view"
  | "parts.view" | "parts.manage" | "purchase_orders.manage"
  | "reports.view" | "reports.financial"
  | "appointments.view" | "appointments.manage"
  | "leads.view" | "leads.manage"
  | "marketing.view"
  | "users.manage" | "permissions.manage" | "settings.manage" | "audit.view"

export interface PermGroup {
  group: string
  perms: { key: Permission; label: string }[]
}

// Drives the admin permission-matrix UI. Order = display order.
export const PERMISSION_CATALOG: PermGroup[] = [
  {
    group: "Customers",
    perms: [
      { key: "customers.view", label: "View customers" },
      { key: "customers.create", label: "Create customers" },
      { key: "customers.edit", label: "Edit customers" },
      { key: "customers.delete", label: "Delete customers" },
    ],
  },
  {
    group: "Vehicles",
    perms: [
      { key: "vehicles.view", label: "View vehicles" },
      { key: "vehicles.create", label: "Add vehicles" },
      { key: "vehicles.edit", label: "Edit vehicles" },
      { key: "vehicles.transfer", label: "Transfer ownership" },
      { key: "vehicles.delete", label: "Delete vehicles" },
    ],
  },
  {
    group: "Job Cards",
    perms: [
      { key: "jobs.view_all", label: "View all jobs" },
      { key: "jobs.view_assigned", label: "View assigned jobs only" },
      { key: "jobs.create", label: "Create job cards" },
      { key: "jobs.edit", label: "Edit job cards" },
      { key: "jobs.update_status", label: "Update job status" },
      { key: "jobs.assign", label: "Assign technicians" },
      { key: "jobs.delete", label: "Delete job cards" },
    ],
  },
  {
    group: "Quotations",
    perms: [
      { key: "quotations.view", label: "View quotations" },
      { key: "quotations.create", label: "Create quotations" },
      { key: "quotations.edit", label: "Edit quotations" },
      { key: "quotations.approve", label: "Approve quotations" },
    ],
  },
  {
    group: "Invoices & Payments",
    perms: [
      { key: "invoices.view", label: "View invoices" },
      { key: "invoices.create", label: "Create invoices" },
      { key: "invoices.edit", label: "Edit invoices" },
      { key: "payments.view", label: "View payments" },
      { key: "payments.record", label: "Record payments" },
      { key: "prices.view", label: "See prices & totals" },
    ],
  },
  {
    group: "Parts & Inventory",
    perms: [
      { key: "parts.view", label: "View parts & inventory" },
      { key: "parts.manage", label: "Manage inventory" },
      { key: "purchase_orders.manage", label: "Manage purchase orders" },
    ],
  },
  {
    group: "Reports",
    perms: [
      { key: "reports.view", label: "View reports" },
      { key: "reports.financial", label: "View financial reports" },
    ],
  },
  {
    group: "Website & Leads",
    perms: [
      { key: "appointments.view", label: "View appointments" },
      { key: "appointments.manage", label: "Manage appointments" },
      { key: "leads.view", label: "View leads" },
      { key: "leads.manage", label: "Manage leads" },
      { key: "marketing.view", label: "View website analytics" },
    ],
  },
  {
    group: "Administration",
    perms: [
      { key: "users.manage", label: "Manage users" },
      { key: "permissions.manage", label: "Edit permissions matrix" },
      { key: "settings.manage", label: "Manage settings" },
      { key: "audit.view", label: "View audit log" },
    ],
  },
]

export const ALL_PERMISSIONS: Permission[] = PERMISSION_CATALOG.flatMap((g) => g.perms.map((p) => p.key))

// ---------------- Invite lifecycle ----------------

export type InviteStatus = "not_sent" | "invited" | "email_failed" | "accepted" | "active"

export interface InviteStatusMeta {
  label: string
  /** Tailwind tone key used by the badge in the UI */
  tone: "muted" | "amber" | "destructive" | "sky" | "emerald"
  description: string
}

export const INVITE_STATUS_META: Record<InviteStatus, InviteStatusMeta> = {
  not_sent: { label: "Not sent", tone: "muted", description: "Account created but no invite sent yet." },
  invited: { label: "Invited", tone: "amber", description: "Invite link generated; awaiting password setup." },
  email_failed: { label: "Email failed", tone: "destructive", description: "Automatic email failed — share the link manually." },
  accepted: { label: "Password set", tone: "sky", description: "User set their password but hasn't signed in yet." },
  active: { label: "Active", tone: "emerald", description: "User has signed in and is active." },
}

export function inviteStatusMeta(status: string | null | undefined): InviteStatusMeta {
  return INVITE_STATUS_META[(status ?? "not_sent") as InviteStatus] ?? INVITE_STATUS_META.not_sent
}
