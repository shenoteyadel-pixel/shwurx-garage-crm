"use server"

import { revalidatePath } from "next/cache"
import { restoreArchived, purgeArchived, type RecycleEntityKey } from "@/lib/recycle-bin"

// Paths that may display any soft-deletable record, revalidated after a
// restore so the recovered row reappears immediately.
const AFFECTED_PATHS = ["/recycle-bin", "/suppliers", "/inventory", "/parts", "/crm", "/reports", "/flow"]

function revalidateAll() {
  for (const p of AFFECTED_PATHS) revalidatePath(p)
}

export async function restoreRecord(entity: RecycleEntityKey, id: string) {
  await restoreArchived(entity, id)
  revalidateAll()
}

export async function purgeRecord(entity: RecycleEntityKey, id: string) {
  await purgeArchived(entity, id)
  revalidatePath("/recycle-bin")
}
