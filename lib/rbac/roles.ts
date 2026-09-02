// Central RBAC role + permission catalog.
// This mirrors the DB tables (role_permissions / permission_overrides) and the
// SQL helper functions. The DB is the source of truth for enforcement; these
// constants drive UI, labels, and the editable admin matrix.

export type Role =
  | "owner"
  | "general_manager"
  | "service_advisor"
  | "workshop_supervisor"
  | "technician"
  | "parts"
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
  { value: "service_advisor", label: "Service Advisor", description: "Front desk: customers, vehicles, job cards, quotations and invoicing.", home: "/", staff: true },
  { value: "workshop_supervisor", label: "Workshop Supervisor", description: "Assigns and manages workshop jobs and technicians.", home: "/board", staff: true },
  { value: "technician", label: "Technician", description: "Works on assigned jobs and updates their status. No prices or invoices.", home: "/my-jobs", staff: true },
  { value: "parts", label: "Parts / Store", description: "Manages inventory, parts requests and purchase orders.", home: "/parts", staff: true },
  { value: "finance", label: "Finance / Accounts", description: "Invoices, payments and financial reports. No workshop edits.", home: "/invoices", staff: true },
  { value: "washing", label: "Washing / Detailing", description: "Works on assigned wash jobs and updates their status.", home: "/my-jobs", staff: true },
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
