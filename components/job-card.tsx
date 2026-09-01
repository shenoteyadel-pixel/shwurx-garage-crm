import Link from "next/link"
import { Badge } from "@/components/ui"
import { STAGE_MAP, type Stage } from "@/lib/constants"
import { formatDate, relativeHours } from "@/lib/utils"
import { Car, Phone, User, Clock } from "lucide-react"

export interface JobCardData {
  id: string
  job_number: string
  customer_name: string
  customer_mobile: string
  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_year: number | null
  plate_number: string | null
  stage: Stage
  approval_status: "pending" | "approved" | "rejected"
  created_at: string
  updated_at: string
  cover?: string | null
  advisor?: string | null
}

export function JobCard({ job }: { job: JobCardData }) {
  const stage = STAGE_MAP[job.stage]
  const vehicle = [job.vehicle_year, job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ") || "Vehicle"
  const hrs = relativeHours(job.created_at)
  const age = hrs < 24 ? `${Math.round(hrs)}h` : `${Math.round(hrs / 24)}d`

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="group block overflow-hidden rounded-xl border border-border bg-card transition hover:border-primary/50 hover:shadow-lg hover:shadow-black/20"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-secondary">
        {job.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={job.cover || "/placeholder.svg"}
            alt={vehicle}
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Car className="h-10 w-10" />
          </div>
        )}
        <div className="absolute left-2 top-2">
          <Badge className={stage.chip}>
            <span className={`h-1.5 w-1.5 rounded-full ${stage.dot}`} />
            {stage.label}
          </Badge>
        </div>
        {job.approval_status === "approved" && (
          <div className="absolute right-2 top-2">
            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40">Approved</Badge>
          </div>
        )}
        {job.approval_status === "rejected" && (
          <div className="absolute right-2 top-2">
            <Badge className="bg-red-500/20 text-red-300 border-red-500/40">Rejected</Badge>
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-semibold">{vehicle}</h3>
            <p className="font-mono text-xs text-muted-foreground">{job.job_number}</p>
          </div>
          {job.plate_number && (
            <span className="shrink-0 rounded-md border border-border bg-background px-2 py-1 font-mono text-xs">
              {job.plate_number}
            </span>
          )}
        </div>

        <div className="mt-3 space-y-1.5 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            <span className="truncate text-foreground">{job.customer_name}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="h-3.5 w-3.5" />
            <span className="truncate">{job.customer_mobile}</span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {age} in shop
          </span>
          <span>{formatDate(job.updated_at).split(",")[0]}</span>
        </div>
      </div>
    </Link>
  )
}
