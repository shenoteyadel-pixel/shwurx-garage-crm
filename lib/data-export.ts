export type ExportDataset = { table: string; label: string }
export type ExportGroup = { label: string; datasets: ExportDataset[] }

// Secrets, push tokens, portal tokens and internal counters are deliberately left out.
export const EXPORT_GROUPS: ExportGroup[] = [
  {
    label: "Customers & Vehicles",
    datasets: [
      { table: "customers", label: "Customers" },
      { table: "vehicles", label: "Vehicles" },
      { table: "leads", label: "Leads" },
      { table: "appointments", label: "Appointments" },
    ],
  },
  {
    label: "Workshop",
    datasets: [
      { table: "jobs", label: "Jobs" },
      { table: "job_addons", label: "Job add-ons" },
      { table: "vehicle_inspections", label: "Vehicle inspections" },
      { table: "inspection_markers", label: "Inspection markers" },
      { table: "diagnostic_sessions", label: "Diagnostic sessions" },
      { table: "diagnostic_tests", label: "Diagnostic tests" },
      { table: "parts_requests", label: "Parts requests" },
      { table: "approval_requests", label: "Approval requests" },
      { table: "approval_item_decisions", label: "Approval decisions" },
    ],
  },
  {
    label: "Sales",
    datasets: [
      { table: "quotations", label: "Quotations" },
      { table: "quotation_items", label: "Quotation items" },
      { table: "invoices", label: "Invoices" },
      { table: "invoice_items", label: "Invoice items" },
      { table: "payments", label: "Payments" },
    ],
  },
  {
    label: "Purchasing & Stock",
    datasets: [
      { table: "suppliers", label: "Suppliers" },
      { table: "supplier_invoices", label: "Supplier invoices" },
      { table: "supplier_invoice_items", label: "Supplier invoice items" },
      { table: "purchase_orders", label: "Purchase orders" },
      { table: "purchase_order_items", label: "Purchase order items" },
      { table: "inventory_items", label: "Inventory items" },
      { table: "stock_movements", label: "Stock movements" },
    ],
  },
  {
    label: "Finance & Staff",
    datasets: [
      { table: "car_expenses", label: "Car expenses" },
      { table: "business_expenses", label: "Business expenses" },
      { table: "employee_salaries", label: "Employee salaries" },
      { table: "salary_payments", label: "Salary payments" },
      { table: "attendance", label: "Attendance" },
      { table: "profiles", label: "Users" },
    ],
  },
  {
    label: "System",
    datasets: [
      { table: "audit_logs", label: "Audit logs" },
      { table: "notifications", label: "Notifications" },
      { table: "settings", label: "Settings" },
    ],
  },
]

export const EXPORT_TABLES = new Set(EXPORT_GROUPS.flatMap((g) => g.datasets.map((d) => d.table)))
