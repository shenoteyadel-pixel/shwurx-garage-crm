/** Native disclosure FAQ — accessible and works without JavaScript. */
export function FaqList({ items }: { items: { id: string; q: string; a: string }[] }) {
  return (
    <div className="mt-4 divide-y divide-border rounded-2xl border border-border bg-card">
      {items.map((f) => (
        <details key={f.id} className="group p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
            {f.q}
            <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
        </details>
      ))}
    </div>
  )
}
