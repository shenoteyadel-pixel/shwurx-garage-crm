import type { MetadataRoute } from "next"
import { SITE_URL } from "@/lib/website/render"

export default function robots(): MetadataRoute.Robots {
  // Only the production deployment is indexable; previews share production data.
  const indexable = process.env.VERCEL_ENV === "production" || !process.env.VERCEL_ENV
  if (!indexable) return { rules: [{ userAgent: "*", disallow: "/" }] }
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/auth/",
          "/crm",
          "/portal",
          "/track",
          "/approve",
          "/approval",
          "/customer-access",
          "/pay",
          "/website",
          "/marketing",
          "/settings",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
