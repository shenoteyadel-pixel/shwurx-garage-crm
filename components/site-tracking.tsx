import Script from "next/script"
import { getSettings } from "@/lib/settings"

// Marketing / analytics tags configured on the Marketing page. Mounted only in
// the public website layout — never on CRM, auth, portal or tokenized customer
// routes. Verification is independent of the tracking switch. When GTM is set,
// GA4 is expected to be configured inside GTM, so the direct gtag snippet is
// skipped to avoid double-counting. IDs are sanitized on save.
export async function SiteTracking({ disabled = false }: { disabled?: boolean }) {
  const s = await getSettings()
  const verify = s.google_site_verification
  const on = !!s.tracking_enabled && !disabled

  const gtm = on ? s.gtm_container_id : null
  const ga4 = on && !gtm ? s.ga4_measurement_id : null
  const pixel = on ? s.meta_pixel_id : null

  return (
    <>
      {verify && <meta name="google-site-verification" content={verify} />}

      {gtm && (
        <Script id="gtm-base" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtm}');`}
        </Script>
      )}

      {ga4 && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga4}`} strategy="afterInteractive" />
          <Script id="ga4-base" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga4}');`}
          </Script>
        </>
      )}

      {pixel && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');`}
        </Script>
      )}
    </>
  )
}
