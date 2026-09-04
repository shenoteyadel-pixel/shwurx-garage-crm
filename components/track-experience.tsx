import {
  Wrench,
  Check,
  Clock3,
  CircleCheck,
  CircleDashed,
  User,
  CalendarClock,
  Camera,
  Package,
  FileText,
  ShieldCheck,
  ArrowRight,
  Phone,
  MessageCircle,
  KeyRound,
  ClipboardCheck,
} from "lucide-react"
import { VehicleVisual } from "@/components/vehicle-visual"
import { TrackInspectionDiagram } from "@/components/track-inspection-diagram"
import type { TrackingDetail, TrackMilestone, TrackPhoto } from "@/lib/tracking-data"
import type { TrackingStatus } from "@/lib/portal-data"

const GARAGE_PHONE = "+971 4 000 0000"

function money(n: number) {
  return new Intl.NumberFormat("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

function formatDateTime(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

export function TrackExperience({ detail, status }: { detail: TrackingDetail; status: TrackingStatus }) {
  const isReady = detail.stage === "ready_for_delivery" || detail.stage === "delivered"
  const isDelivered = detail.stage === "delivered"

  return (
    <main className="min-h-dvh bg-background pb-16">
      {/* ---------- Hero ---------- */}
      <section className="relative">
        <div className="relative h-60 w-full sm:h-72">
          <VehicleVisual
            referenceImage={detail.referenceImage}
            make={detail.make}
            model={detail.model}
            bodyType={detail.bodyType}
            color={detail.color}
            className="h-full w-full"
            alt={detail.vehicleLabel}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/10" />

          {/* Brand + status chip */}
          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Wrench className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-foreground/90">SHWURX</span>
            </div>
            <StatusChip status={status} />
          </div>
        </div>

        {/* Title block overlapping the image bottom */}
        <div className="relative -mt-14 px-4">
          <div className="mx-auto max-w-lg">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {detail.jobNumber ? `Job ${detail.jobNumber}` : "Live vehicle tracking"}
            </p>
            <h1 className="mt-1 text-2xl font-bold leading-tight tracking-tight text-balance">
              {detail.vehicleLabel}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {detail.plate && (
                <span className="rounded-md border border-border bg-card px-2 py-1 font-mono text-xs font-semibold">
                  {detail.plate}
                </span>
              )}
              {detail.color && <MetaPill>{detail.color}</MetaPill>}
              {detail.mileage != null && <MetaPill>{detail.mileage.toLocaleString()} km</MetaPill>}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto mt-6 max-w-lg space-y-5 px-4">
        {/* ---------- Current status headline ---------- */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current status</span>
            <span className="text-xs font-semibold text-muted-foreground">{detail.progressPct}%</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${detail.stage === "delivered" ? "bg-neutral-400" : "animate-pulse bg-emerald-400"}`} />
            <h2 className={`text-xl font-bold ${detail.stageAccentText}`}>{detail.stageLabel}</h2>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {detail.milestones.find((m) => m.state === "current")?.description ??
              "We're taking care of your vehicle."}
          </p>

          {/* Progress bar */}
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
              style={{ width: `${detail.progressPct}%` }}
            />
          </div>

          {detail.updatedAt && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" /> Last updated {formatDateTime(detail.updatedAt)}
            </p>
          )}
        </section>

        {/* ---------- Ready-for-collection highlight ---------- */}
        {isReady && (
          <section className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5">
            <div className="flex items-center gap-2 text-emerald-300">
              <CircleCheck className="h-5 w-5" />
              <h3 className="text-base font-bold">
                {isDelivered ? "Vehicle delivered" : "Ready for collection"}
              </h3>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-emerald-200/80">
              {isDelivered
                ? "Your vehicle has been handed back. We hope to see you again!"
                : "All work is complete and your vehicle is waiting for you. Please bring your collection details when you visit."}
            </p>
            {!isDelivered && (
              <a
                href={`tel:${GARAGE_PHONE.replace(/\s/g, "")}`}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400"
              >
                <Phone className="h-4 w-4" /> Call to arrange collection
              </a>
            )}
          </section>
        )}

        {/* ---------- Quotation & approval ---------- */}
        {detail.quote && (
          <section className="rounded-2xl border border-border bg-card p-5">
            <SectionHeader icon={<FileText className="h-4 w-4" />} title="Your quotation" />
            {detail.quote.awaitingApproval ? (
              <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
                <div className="flex items-center gap-2 text-amber-300">
                  <ShieldCheck className="h-4 w-4" />
                  <span className="text-sm font-semibold">Awaiting your approval</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-amber-200/80">
                  Please review and approve your quotation so we can begin the work.
                </p>
                <p className="mt-3 text-2xl font-bold">
                  AED {money(detail.quote.total)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {detail.quote.vatInclusive ? "incl. VAT" : "+ VAT"}
                  </span>
                </p>
                {detail.quote.approvalPath && (
                  <a
                    href={detail.quote.approvalPath}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Review &amp; approve <ArrowRight className="h-4 w-4" />
                  </a>
                )}
              </div>
            ) : (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="flex items-center gap-2 text-emerald-300">
                  <CircleCheck className="h-4 w-4" />
                  <span className="text-sm font-semibold">
                    {detail.quote.approved ? "Approved" : "Quotation on file"}
                  </span>
                </div>
                <span className="text-lg font-bold">AED {money(detail.quote.total)}</span>
              </div>
            )}

            {detail.quote.items.length > 0 && (
              <ul className="mt-4 space-y-2">
                {detail.quote.items.map((it, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 text-sm">
                    <span className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                          it.kind === "labor" || it.kind === "labour"
                            ? "bg-fuchsia-500/15 text-fuchsia-300"
                            : "bg-sky-500/15 text-sky-300"
                        }`}
                      >
                        {it.kind === "labor" || it.kind === "labour" ? "Labour" : "Part"}
                      </span>
                      <span className="text-foreground">
                        {it.description}
                        {it.quantity > 1 && <span className="text-muted-foreground"> × {it.quantity}</span>}
                      </span>
                    </span>
                    {it.lineTotal != null && (
                      <span className="shrink-0 tabular-nums text-muted-foreground">AED {money(it.lineTotal)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ---------- Progress timeline ---------- */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <SectionHeader icon={<Wrench className="h-4 w-4" />} title="Service progress" />
          <ol className="mt-4">
            {detail.milestones.map((m, i) => (
              <MilestoneRow key={m.key} milestone={m} isLast={i === detail.milestones.length - 1} />
            ))}
          </ol>
        </section>

        {/* ---------- Parts ---------- */}
        {detail.parts.length > 0 && (
          <section className="rounded-2xl border border-border bg-card p-5">
            <SectionHeader icon={<Package className="h-4 w-4" />} title="Parts" />
            <ul className="mt-3 space-y-2">
              {detail.parts.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-foreground">
                    {p.name}
                    {p.quantity > 1 && <span className="text-muted-foreground"> × {p.quantity}</span>}
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                      p.status === "received"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : p.status === "backordered"
                          ? "bg-red-500/15 text-red-300"
                          : "bg-amber-500/15 text-amber-300"
                    }`}
                  >
                    {p.statusLabel}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---------- Photos ---------- */}
        {(detail.beforePhotos.length > 0 || detail.afterPhotos.length > 0) && (
          <section className="rounded-2xl border border-border bg-card p-5">
            <SectionHeader icon={<Camera className="h-4 w-4" />} title="Photos" />
            {detail.beforePhotos.length > 0 && (
              <PhotoGroup label="Before" photos={detail.beforePhotos} />
            )}
            {detail.afterPhotos.length > 0 && <PhotoGroup label="After" photos={detail.afterPhotos} />}
          </section>
        )}

        {/* ---------- Vehicle condition (inspection diagram) ---------- */}
        {detail.inspection && (
          <section className="rounded-2xl border border-border bg-card p-5">
            <SectionHeader icon={<ClipboardCheck className="h-4 w-4" />} title="Vehicle condition at check-in" />
            <p className="mb-3 mt-1 text-xs leading-relaxed text-muted-foreground">
              This is the documented condition of your vehicle when we received it. Tap any point to see details.
            </p>
            <TrackInspectionDiagram inspection={detail.inspection} />
          </section>
        )}

        {/* ---------- Details ---------- */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <SectionHeader icon={<FileText className="h-4 w-4" />} title="Service details" />
          <dl className="mt-3 space-y-3 text-sm">
            {detail.complaint && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reported concern</dt>
                <dd className="mt-0.5 leading-relaxed text-foreground">{detail.complaint}</dd>
              </div>
            )}
            {detail.technicianFirstName && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Your technician:</span>
                <span className="font-medium text-foreground">{detail.technicianFirstName}</span>
              </div>
            )}
            {formatDate(detail.estimatedCompletion) && (
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Estimated ready:</span>
                <span className="font-medium text-foreground">{formatDate(detail.estimatedCompletion)}</span>
              </div>
            )}
          </dl>
        </section>

        {/* ---------- Invoice ---------- */}
        {detail.invoice && (
          <section className="rounded-2xl border border-border bg-card p-5">
            <SectionHeader icon={<FileText className="h-4 w-4" />} title="Invoice" />
            <div className="mt-3 space-y-2 text-sm">
              {detail.invoice.invoiceNumber && (
                <Row label="Invoice" value={detail.invoice.invoiceNumber} mono />
              )}
              <Row label="Total" value={`AED ${money(detail.invoice.total)}`} />
              <Row label="Paid" value={`AED ${money(detail.invoice.amountPaid)}`} />
              {detail.invoice.outstanding > 0 && (
                <div className="flex items-center justify-between border-t border-border pt-2">
                  <span className="font-semibold text-foreground">Outstanding</span>
                  <span className="text-lg font-bold text-amber-300">AED {money(detail.invoice.outstanding)}</span>
                </div>
              )}
              {detail.invoice.outstanding === 0 && detail.invoice.total > 0 && (
                <div className="flex items-center gap-2 border-t border-border pt-2 text-emerald-300">
                  <CircleCheck className="h-4 w-4" />
                  <span className="text-sm font-semibold">Fully paid — thank you</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ---------- Contact / help ---------- */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <SectionHeader icon={<MessageCircle className="h-4 w-4" />} title="Need help?" />
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Questions about your service? Our team is happy to help.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={`tel:${GARAGE_PHONE.replace(/\s/g, "")}`}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground hover:bg-secondary/80"
            >
              <Phone className="h-4 w-4" /> Call us
            </a>
            <a
              href="/portal"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground hover:bg-secondary/80"
            >
              <KeyRound className="h-4 w-4" /> Customer portal
            </a>
          </div>
        </section>

        <p className="pt-2 text-center text-xs text-muted-foreground">
          This is a private, read-only view of your service for {detail.customerName}.
        </p>
      </div>
    </main>
  )
}

/* ------------------------------ sub-components ------------------------------ */

function StatusChip({ status }: { status: TrackingStatus }) {
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
        <CircleCheck className="h-3.5 w-3.5" /> Completed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Live
    </span>
  )
}

function MetaPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground">{children}</span>
  )
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
        {icon}
      </span>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
    </div>
  )
}

function MilestoneRow({ milestone, isLast }: { milestone: TrackMilestone; isLast: boolean }) {
  const { state, label, description } = milestone
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
            state === "done"
              ? "border-emerald-500 bg-emerald-500 text-emerald-950"
              : state === "current"
                ? "border-emerald-400 bg-emerald-400/15 text-emerald-300"
                : "border-border bg-transparent text-muted-foreground"
          }`}
        >
          {state === "done" ? (
            <Check className="h-4 w-4" />
          ) : state === "current" ? (
            <Clock3 className="h-4 w-4" />
          ) : (
            <CircleDashed className="h-4 w-4" />
          )}
        </span>
        {!isLast && (
          <span className={`my-1 w-0.5 flex-1 ${state === "done" ? "bg-emerald-500/60" : "bg-border"}`} />
        )}
      </div>
      <div className={`pb-5 ${isLast ? "" : ""}`}>
        <p
          className={`text-sm font-semibold ${
            state === "upcoming" ? "text-muted-foreground" : "text-foreground"
          }`}
        >
          {label}
        </p>
        {state !== "upcoming" && (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
    </li>
  )
}

function PhotoGroup({ label, photos }: { label: string; photos: TrackPhoto[] }) {
  return (
    <div className="mt-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((p) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={p.id}
            src={p.url || "/placeholder.svg"}
            alt={p.caption || `${label} photo`}
            className="aspect-square w-full rounded-lg border border-border object-cover"
            crossOrigin="anonymous"
          />
        ))}
      </div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium text-foreground ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  )
}
