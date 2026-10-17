import { Card, Badge } from "@/components/ui"
import { CopyValue } from "@/components/copy-value"
import { MetaImportButton } from "@/components/meta-import-button"
import { MetaConnectForm } from "@/components/meta-connect-form"

export interface AdSourceStatus {
  provider: "meta" | "google"
  label: string
  url: string
  secretLabel: string
  secret: string | null
  ready: boolean
  missing: string[]
  connectNeeded?: boolean
  connectedNote?: string | null
  events: number
  lastAt: string | null
  lastError: string | null
  steps: string[]
}

function formatWhen(iso: string | null) {
  if (!iso) return "Never"
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" })
}

export function AdSourcesCard({ sources }: { sources: AdSourceStatus[] }) {
  return (
    <section aria-labelledby="ad-sources-heading" className="mb-6 flex flex-col gap-3">
      <div>
        <h2 id="ad-sources-heading" className="text-sm font-semibold text-foreground">
          Ad lead sources
        </h2>
        <p className="text-sm text-muted-foreground">
          Paste these values into Meta and Google Ads once. New form submissions then land here automatically.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {sources.map((s) => (
          <Card key={s.provider} className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-foreground">{s.label}</p>
              <Badge className={s.ready ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}>
                {s.ready ? "Ready" : "Setup needed"}
              </Badge>
            </div>
            <CopyValue label="Webhook URL" value={s.url} masked />
            {s.secret ? <CopyValue label={s.secretLabel} value={s.secret} masked /> : null}
            {s.missing.length ? (
              <p className="text-sm text-destructive">Missing: {s.missing.join(", ")}</p>
            ) : null}
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm leading-relaxed text-muted-foreground">
              {s.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {s.provider === "meta" ? (
              <>
                {s.connectedNote ? <p className="text-sm text-primary">{s.connectedNote}</p> : null}
                <MetaConnectForm needed={!!s.connectNeeded} />
                <MetaImportButton disabled={!s.ready} />
              </>
            ) : null}
            <div className="flex flex-col gap-1 border-t border-border pt-3 text-xs text-muted-foreground">
              <span>
                {s.events} call{s.events === 1 ? "" : "s"} received · last {formatWhen(s.lastAt)}
              </span>
              {s.lastError ? <span className="text-destructive">Last error: {s.lastError}</span> : null}
            </div>
          </Card>
        ))}
      </div>
    </section>
  )
}
