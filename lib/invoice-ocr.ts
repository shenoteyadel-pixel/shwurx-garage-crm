import "server-only"
import { generateObject } from "ai"
import { z } from "zod"

/**
 * Structured supplier-invoice extraction via a vision model on the Vercel AI
 * Gateway (zero-config auth in v0/Vercel). Every field is nullable so a messy
 * scan never throws — the review UI shows low-confidence fields for a human to
 * fix before anything is committed to stock or the ledger.
 */
const lineItemSchema = z.object({
  description: z.string().describe("The part/item description exactly as printed"),
  oem_part_number: z
    .string()
    .nullable()
    .describe(
      "The MANUFACTURER / OEM part number only — the vehicle maker's or brand's own number (e.g. Mercedes A2059053414, BMW 34116888459, Bosch 0986452041). This is the reliable cross-supplier identity. Return null if the printed code is clearly the supplier's own catalogue code, or if you are not confident it is a genuine OEM number.",
    ),
  supplier_part_number: z
    .string()
    .nullable()
    .describe(
      "The SUPPLIER'S OWN catalogue / line / reference code for this item, when it is distinct from the OEM number. Different suppliers use different codes for the same physical part. Return null if absent.",
    ),
  part_number_kind_confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("0..1 confidence that the OEM vs supplier classification above is correct"),
  quantity: z.number().describe("Quantity ordered; use 1 if not clearly stated"),
  unit: z.string().nullable().describe("Unit such as pcs, set, ltr; null if absent"),
  unit_cost: z.number().describe("Unit price EXCLUDING VAT"),
  line_total: z.number().describe("Line total EXCLUDING VAT (quantity x unit_cost)"),
  confidence: z.number().min(0).max(1).describe("0..1 confidence in this line's overall accuracy"),
})

const invoiceSchema = z.object({
  supplier_name: z.string().nullable().describe("Supplier / vendor company name"),
  supplier_trn: z.string().nullable().describe("Supplier Tax Registration Number if shown"),
  supplier_phone: z.string().nullable().describe("Supplier phone / mobile / landline number if printed, else null"),
  supplier_email: z.string().nullable().describe("Supplier email address if printed, else null"),
  supplier_address: z.string().nullable().describe("Supplier full postal address if printed, else null"),
  invoice_number: z.string().nullable().describe("The supplier's invoice / bill number"),
  invoice_date: z.string().nullable().describe("Invoice date as ISO YYYY-MM-DD if determinable"),
  currency: z.string().nullable().describe("ISO currency code; default AED for UAE invoices"),
  subtotal: z.number().nullable().describe("Net total EXCLUDING VAT, BEFORE discount"),
  discount_amount: z.number().nullable().describe("Total discount amount if shown, else null (never negative)"),
  vat_amount: z.number().nullable().describe("Total VAT/tax amount"),
  total: z.number().nullable().describe("Grand total INCLUDING VAT"),
  confidence: z.number().min(0).max(1).describe("0..1 overall confidence in the extraction"),
  line_items: z.array(lineItemSchema).describe("Every purchasable line; exclude subtotal/VAT/total rows"),
})

export type ExtractedInvoice = z.infer<typeof invoiceSchema>
export type ExtractedLine = z.infer<typeof lineItemSchema>

// Fast, cheap, strong at document understanding and multi-page PDFs.
const MODEL = "google/gemini-2.5-flash"

const PROMPT = [
  "You are an accounts-payable clerk for a UAE automotive workshop.",
  "Read this supplier invoice / bill (it may be a photo, a scan, or a PDF, and may be in English or Arabic) and extract every field.",
  "Also capture the supplier's contact details (phone, email, address) when printed — these are used to create or update the supplier profile.",
  "Money values must be plain numbers with no currency symbols or thousands separators.",
  "Line items are the purchasable parts/products only — never include subtotal, discount, VAT, or grand-total summary rows as line items.",
  "For each line, decide whether a detected code is a MANUFACTURER/OEM part number or the SUPPLIER'S OWN part/reference number — do NOT assume every code is an OEM number. Put each in the correct field and leave the other null when unsure. The invoice number itself is never a part number.",
  "If a value is missing or unreadable, return null rather than guessing. UAE standard VAT is 5%.",
  "Set a realistic confidence (0..1) per line, for the OEM-vs-supplier classification, and overall so a human knows what to double-check.",
].join(" ")

export async function extractInvoice(data: Uint8Array, mediaType: string): Promise<ExtractedInvoice> {
  const { object } = await generateObject({
    model: MODEL,
    schema: invoiceSchema,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          { type: "file", mediaType, data },
        ],
      },
    ],
  })
  return object
}
