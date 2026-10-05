import Script from "next/script"
import { normalizeRuntime, type RuntimeTags } from "@/lib/website/analytics"
import { CONSENT_KEY, LEGACY_CONSENT_KEY } from "@/lib/consent"

/**
 * One ordered bootstrap:
 *  1. Consent Mode v2 defaults (denied until chosen) before any measurement.
 *  2. Basic blocking: no Google or Meta script is requested until the visitor
 *     grants the matching consent. `__shwurxApplyConsent` loads or updates
 *     tags whenever the choice changes (banner, privacy choices, revocation).
 *  3. Exactly one Google owner: the GTM container (GA4/Ads configured inside
 *     it) or the direct gtag with automatic page views disabled, because the
 *     app sends one page_view per committed public route.
 * IDs are format-validated before they reach this point.
 */
function bootstrap(tags: RuntimeTags): string {
  const cfg = JSON.stringify({
    consent: tags.consentRequired,
    key: CONSENT_KEY,
    old: LEGACY_CONSENT_KEY,
    gtm: tags.gtmId,
    ga4: tags.ga4Id,
    ads: tags.adsId,
    pixel: tags.metaPixelId,
  }).replace(/</g, "\\u003c")
  return `(function(c){var w=window,d=document;if(c.consent)w.__shwurxConsentNeeded=true;w.dataLayer=w.dataLayer||[];if(typeof w.gtag!=='function'){w.gtag=function(){w.dataLayer.push(arguments)}}
function read(){if(!c.consent)return{analytics:true,ads:true};try{var s=JSON.parse(localStorage.getItem(c.key)||'null');if(s&&s.v===2)return{analytics:s.analytics===true,ads:s.ads===true};var o=localStorage.getItem(c.old);if(o==='granted')return{analytics:true,ads:true};if(o==='denied')return{analytics:false,ads:false}}catch(e){}return w.__shwurxConsent||null}
function sig(s){var a=s&&s.analytics?'granted':'denied',m=s&&s.ads?'granted':'denied';return{analytics_storage:a,ad_storage:m,ad_user_data:m,ad_personalization:m}}
var st=read();w.gtag('consent','default',sig(st));w.gtag('set','ads_data_redaction',true);
var g=false,p=false;function load(src){var e=d.createElement('script');e.async=true;e.src=src;d.head.appendChild(e)}
w.__shwurxApplyConsent=function(s){w.__shwurxConsent=s;w.gtag('consent','update',sig(s));
if(s&&(s.analytics||s.ads)&&!g&&(c.gtm||c.ga4||c.ads)){g=true;w.__shwurxTagsLoaded=true;
if(c.gtm){w.dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});load('https://www.googletagmanager.com/gtm.js?id='+encodeURIComponent(c.gtm))}
else{load('https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(c.ga4||c.ads));w.gtag('js',new Date());if(c.ga4)w.gtag('config',c.ga4,{send_page_view:false});if(c.ads)w.gtag('config',c.ads)}}
if(c.pixel){if(s&&s.ads){if(!p){p=true;w.__shwurxTagsLoaded=true;!function(f,b,e,v,n,t,x){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;x=b.getElementsByTagName(e)[0];x.parentNode.insertBefore(t,x)}(w,d,'script','https://connect.facebook.net/en_US/fbevents.js');w.fbq('init',c.pixel);w.fbq('track','PageView')}else{w.fbq('consent','grant')}}else if(p){w.fbq('consent','revoke')}}
w.dispatchEvent(new Event('shwurx:tags'))};
w.__shwurxApplyConsent(st);
})(${cfg});`
}

/** Mounted only in the public website layout — never on CRM, auth, portal or token routes. */
export function SiteTracking({ tags: input }: { tags?: RuntimeTags | null }) {
  const tags = normalizeRuntime(input)
  return (
    <>
      {/* Search Console verification is independent of tag loading and consent. */}
      {tags.verificationToken && <meta name="google-site-verification" content={tags.verificationToken} />}
      {tags.thirdParty && (
        <Script id="shwurx-tags" strategy="afterInteractive">
          {bootstrap(tags)}
        </Script>
      )}
    </>
  )
}
