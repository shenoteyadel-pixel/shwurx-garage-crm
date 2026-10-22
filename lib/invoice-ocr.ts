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
  brand: z
    .string()
    .nullable()
    .describe("Brand / type / grade column if printed (e.g. Genuine, AK, Febi, ZF, Aftermarket); null if absent or a dash"),
  quantity: z
    .number()
    .nullable()
    .describe("Numeric quantity. For 'Per liter' / 'per unit' / blank, return 1. Null only if truly unknowable."),
  unit: z.string().nullable().describe("Unit such as pcs, set, ltr; use ltr for 'Per liter'; null if absent"),
  unit_cost: z.number().nullable().describe("Unit price EXCLUDING VAT. '100.00 + VAT' means 100. '600.00 each' means 600."),
  line_total: z
    .number()
    .nullable()
    .describe("Line total EXCLUDING VAT. If printed as TBC / blank / non-numeric, return null."),
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
  "The document may be a supplier QUOTATION offering several brand options for the same part (e.g. Genuine vs AK vs Febi). Return EVERY row as its own line item and put the option in `brand` — never merge or drop alternatives.",
  "Prices written like '100.00 + VAT' are the ex-VAT unit price (100). '600.00 each' is the unit price (600) with the quantity in the Qty column.",
  "When the Total column INCLUDES VAT (e.g. 105.00 for 100.00 + VAT), still return line_total EXCLUDING VAT (100).",
  "Qty 'Per liter' means price per litre: quantity 1, unit ltr. A total of 'TBC' means line_total null — keep the line.",
  "Every document that shows any amount MUST return at least one line item — never an empty line_items array when a price or total is printed.",
  "Read the table row by row: Description, Brand, Qty, Rate, Tax %, Tax, Amount. 'Rate' is the ex-VAT unit price; 'Amount' is usually the ex-VAT line total (Qty x Rate).",
  "Fuel station / POS receipts (ENOC, ADNOC, Emarat etc.): the product (e.g. DIESEL, SUPER 98) is the line item; litres is the quantity (unit ltr), price per litre is unit_cost (ex-VAT), and the receipt number is the invoice_number. If only a card-payment amount is printed, treat it as the VAT-inclusive total and still return one line for the product.",
  "Summary totals (subtotal / VAT / total) may be absent on quotations; return null for them rather than inventing values.",
  "If a value is missing or unreadable, return null rather than guessing. UAE standard VAT is 5%.",
  "Set a realistic confidence (0..1) per line, for the OEM-vs-supplier classification, and overall so a human knows what to double-check.",
].join(" ")

async function runExtraction(data: Uint8Array, mediaType: string): Promise<ExtractedInvoice> {
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

const hasPricedLine = (x: ExtractedInvoice) =>
  (x.line_items ?? []).some((l) => (l.line_total ?? 0) > 0 || (l.unit_cost ?? 0) > 0)

/**
 * Fuel slips and single-item receipts often come back with the header total but
 * no line rows. Turn the printed totals into one editable line so the bill never
 * shows AED 0.00 and can't be confirmed empty.
 */
function ensureLines(x: ExtractedInvoice): ExtractedInvoice {
  if (hasPricedLine(x)) return x
  const vat = x.vat_amount ?? null
  const net =
    x.subtotal ??
    (x.total != null ? Math.round((vat != null ? x.total - vat : x.total / 1.05) * 100) / 100 : null)
  if (net == null || net <= 0) return x
  const existing = x.line_items?.[0]
  const quantity = existing?.quantity && existing.quantity > 0 ? existing.quantity : 1
  return {
    ...x,
    line_items: [
      {
        description: existing?.description?.trim() || x.supplier_name?.trim() || "Purchase",
        oem_part_number: existing?.oem_part_number ?? null,
        supplier_part_number: existing?.supplier_part_number ?? null,
        part_number_kind_confidence: 0,
        brand: existing?.brand ?? null,
        quantity,
        unit: existing?.unit ?? null,
        unit_cost: Math.round((net / quantity) * 100) / 100,
        line_total: net,
        confidence: 0.5,
      },
    ],
  }
}

/**
 * One retry on malformed output, and one more read when the first pass found no
 * priced lines (common on fuel slips / phone photos). Best result wins.
 */
export async function extractInvoice(data: Uint8Array, mediaType: string): Promise<ExtractedInvoice> {
  let first: ExtractedInvoice
  try {
    first = await runExtraction(data, mediaType)
  } catch (err) {
    console.error("[v0] invoice OCR attempt 1 failed, retrying:", err)
    return ensureLines(await runExtraction(data, mediaType))
  }
  if (hasPricedLine(first)) return first
  try {
    const second = await runExtraction(data, mediaType)
    if (hasPricedLine(second)) return second
  } catch (err) {
    console.error("[v0] invoice OCR re-read failed:", err)
  }
  return ensureLines(first)
}
