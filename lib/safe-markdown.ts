/**
 * Minimal Markdown subset for article bodies: ## / ### headings, - and 1.
 * lists, paragraphs and [text](url) links. Output is plain data rendered as
 * React text, so raw HTML is never interpreted. Links are only kept for
 * https:, mailto:, tel: and same-site paths; anything else becomes text.
 */
export type Inline = { type: "text"; text: string } | { type: "link"; text: string; href: string; external: boolean }
export type Block =
  | { type: "h2" | "h3" | "p"; inlines: Inline[] }
  | { type: "ul" | "ol"; items: Inline[][] }

export function safeHref(raw: string): { href: string; external: boolean } | null {
  const href = raw.trim()
  if (/[\s<>"'`\\]/.test(href) || /[\u0000-\u001f]/.test(href)) return null
  if (href.startsWith("/") && !href.startsWith("//")) return { href, external: false }
  if (href.startsWith("#")) return { href, external: false }
  try {
    const u = new URL(href)
    if (u.protocol === "https:") return { href: u.toString(), external: true }
    if (u.protocol === "mailto:" || u.protocol === "tel:") return { href, external: false }
  } catch {}
  return null
}

const LINK = /\[([^\]\n]{1,300})\]\(([^)\s]{1,2048})\)/g

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of text.matchAll(LINK)) {
    const at = m.index ?? 0
    if (at > last) out.push({ type: "text", text: text.slice(last, at) })
    const safe = safeHref(m[2])
    out.push(safe ? { type: "link", text: m[1], ...safe } : { type: "text", text: m[1] })
    last = at + m[0].length
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) })
  return out
}

export function parseMarkdown(body: string): Block[] {
  const blocks: Block[] = []
  let para: string[] = []
  let list: { type: "ul" | "ol"; items: Inline[][] } | null = null
  const flush = () => {
    if (para.length) blocks.push({ type: "p", inlines: parseInline(para.join("\n")) })
    para = []
    if (list) blocks.push(list)
    list = null
  }
  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flush()
      continue
    }
    const h = /^(#{2,3})\s+(.+)$/.exec(line.trim())
    if (h) {
      flush()
      blocks.push({ type: h[1].length === 2 ? "h2" : "h3", inlines: parseInline(h[2].trim()) })
      continue
    }
    const li = /^\s*(?:([-*])|(\d{1,3})[.)])\s+(.+)$/.exec(line)
    if (li) {
      const type = li[1] ? "ul" : "ol"
      if (para.length) {
        blocks.push({ type: "p", inlines: parseInline(para.join("\n")) })
        para = []
      }
      if (!list || list.type !== type) {
        if (list) blocks.push(list)
        list = { type, items: [] }
      }
      list.items.push(parseInline(li[3].trim()))
      continue
    }
    if (list) {
      blocks.push(list)
      list = null
    }
    para.push(line.trim())
  }
  flush()
  return blocks
}

/** Appends `suffix` unless the title already ends with it (case/space-insensitive). */
export function withSuffix(title: string, suffix: string): string {
  const t = title.trim()
  const s = suffix.trim()
  if (!s) return t
  const norm = (x: string) => x.replace(/\s+/g, " ").toLowerCase()
  const bare = s.replace(/^[|·—–-]\s*/, "")
  if (norm(t).endsWith(norm(s)) || (bare && norm(t).endsWith(norm(bare)))) return t
  return t + (/^\s/.test(suffix) ? suffix : ` ${s}`)
}
