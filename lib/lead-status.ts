export type LeadStatus = "new" | "contacted" | "qualified" | "converted" | "lost"

// Kept outside the "use server" actions module: non-function exports from a server-actions
// file reach client components as server references, not arrays, and crash on iteration.
export const LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "converted", "lost"]
