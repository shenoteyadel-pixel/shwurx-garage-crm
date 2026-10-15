import "server-only"
import { insertAdLead, normalizePhone } from "@/lib/ad-leads"

const GRAPH = "https://graph.facebook.com/v21.0"
const LEAD_FIELDS = "created_time,field_data,ad_id,ad_name,adset_name,campaign_name,form_id,platform,is_organic"

export interface GraphLead {
  id: string
  created_time?: string
  field_data?: { name: string; values?: string[] }[]
  ad_id?: string
  ad_name?: string
  adset_name?: string
  campaign_name?: string
  form_id?: string
  platform?: string
  is_organic?: boolean
}

async function graph<T>(path: string, token: string): Promise<T> {
  const url = path.startsWith("https://") ? path : `${GRAPH}/${path}`
  const sep = url.includes("?") ? "&" : "?"
  const res = await fetch(`${url}${url.includes("access_token=") ? "" : `${sep}access_token=${encodeURIComponent(token)}`}`, {
    cache: "no-store",
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error?.message ?? `Graph API ${res.status}`)
  return body as T
}

export function fetchMetaLead(leadgenId: string, token: string) {
  return graph<GraphLead>(`${encodeURIComponent(leadgenId)}?fields=${LEAD_FIELDS}`, token)
}

export function mapMetaFields(lead: GraphLead) {
  const fields: Record<string, string> = {}
  for (const f of lead.field_data ?? []) fields[f.name.toLowerCase()] = (f.values ?? []).join(", ")
  const take = (...keys: string[]) => {
    for (const k of keys) {
      const v = fields[k]
      if (v) {
        delete fields[k]
        return v
      }
    }
    return null
  }
  const full = take("full_name", "name")
  const first = take("first_name")
  const last = take("last_name")
  const name = full || [first, last].filter(Boolean).join(" ") || null
  const phone = normalizePhone(take("phone_number", "phone", "mobile_number", "whatsapp_number"))
  const email = take("email", "work_email")
  return { name, phone, email, extra: fields }
}

/** Saves a Meta lead into CRM Leads once (deduplicated by lead id). Returns true when newly created. */
export function saveMetaLead(lead: GraphLead, context: { pageId?: string | null; formId?: string | null; adId?: string | null } = {}) {
  const isInstagram = lead.platform === "ig" || lead.platform === "instagram"
  return insertAdLead({
    externalId: `meta:${lead.id}`,
    source: isInstagram ? "instagram" : "facebook",
    ...mapMetaFields(lead),
    metadata: {
      provider: "meta",
      platform: lead.platform ?? null,
      campaign: lead.campaign_name ?? null,
      adset: lead.adset_name ?? null,
      ad: lead.ad_name ?? null,
      form_id: lead.form_id ?? context.formId ?? null,
      page_id: context.pageId ?? null,
      ad_id: lead.ad_id ?? context.adId ?? null,
      organic: lead.is_organic ?? false,
      submitted_at: lead.created_time ?? null,
    },
  })
}

interface Paged<T> {
  data?: T[]
  paging?: { next?: string }
}

async function* pages<T>(first: string, token: string, maxPages = 20) {
  let next: string | undefined = first
  for (let i = 0; next && i < maxPages; i++) {
    const page: Paged<T> = await graph<Paged<T>>(next, token)
    yield page.data ?? []
    next = page.paging?.next
  }
}

export interface MetaImportResult {
  pageName: string | null
  forms: number
  found: number
  created: number
  errors: string[]
}

/** Pulls every lead already submitted on the token's Page lead forms. */
export async function importAllMetaLeads(token: string): Promise<MetaImportResult> {
  const page = await graph<{ id: string; name?: string }>("me?fields=id,name", token)
  const result: MetaImportResult = { pageName: page.name ?? null, forms: 0, found: 0, created: 0, errors: [] }

  for await (const forms of pages<{ id: string; name?: string }>(`${page.id}/leadgen_forms?fields=id,name&limit=100`, token)) {
    for (const form of forms) {
      result.forms++
      try {
        for await (const leads of pages<GraphLead>(`${form.id}/leads?fields=${LEAD_FIELDS}&limit=100`, token)) {
          for (const lead of leads) {
            result.found++
            try {
              if (await saveMetaLead(lead, { pageId: page.id, formId: form.id })) result.created++
            } catch (err) {
              result.errors.push(`lead ${lead.id}: ${(err as Error).message}`)
            }
          }
        }
      } catch (err) {
        result.errors.push(`form ${form.name ?? form.id}: ${(err as Error).message}`)
      }
    }
  }
  return result
}
