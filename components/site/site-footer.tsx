import Link from "next/link"
import { Wrench, Phone, Mail, MapPin } from "lucide-react"
import type { PublicSiteInfo } from "@/lib/site-info"

export function SiteFooter({ info }: { info: PublicSiteInfo }) {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-border bg-card/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-3 lg:px-8">
        <div>
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
              <Wrench className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-base font-bold tracking-tight">{info.companyName}</span>
          </Link>
          <p className="mt-3 max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
            Precision auto care and premium service. Book online and track your vehicle every step of the way.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold">Explore</h3>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
            <li><Link href="/services" className="hover:text-foreground">Services</Link></li>
            <li><Link href="/about" className="hover:text-foreground">About</Link></li>
            <li><Link href="/appointment" className="hover:text-foreground">Book Appointment</Link></li>
            <li><Link href="/track" className="hover:text-foreground">Track Your Car</Link></li>
            <li><Link href="/contact" className="hover:text-foreground">Contact</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold">Get in touch</h3>
          <ul className="mt-3 flex flex-col gap-3 text-sm text-muted-foreground">
            {info.phone && (
              <li className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 text-primary" />
                <a href={`tel:${info.phone.replace(/\s+/g, "")}`} className="hover:text-foreground">{info.phone}</a>
              </li>
            )}
            {info.email && (
              <li className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 text-primary" />
                <a href={`mailto:${info.email}`} className="hover:text-foreground">{info.email}</a>
              </li>
            )}
            {info.address && (
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{info.address}</span>
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row lg:px-8">
          <span>© {year} {info.companyName}. All rights reserved.</span>
          <Link href="/crm" className="hover:text-foreground">Staff Login</Link>
        </div>
      </div>
    </footer>
  )
}
