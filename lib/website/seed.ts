import type { MediaAsset, SeoFields, TeamMember, TeamPage, WebsiteDocument } from "./types"
import { brandHeroId, seedBrands, t } from "./seed-brands"
import brandHeroes from "@/data/editorial/brand-heroes-v2.json"
import { seedServices } from "./seed-services"
import { DEFAULT_ANALYTICS } from "./analytics"
import type { HomeSection } from "./types"

/** Default homepage bands, in display order. Also used to backfill older documents. */
export const HOME_SECTION_DEFAULTS: HomeSection[] = [
  { key: "hero", visible: true, heading: t("", ""), intro: t("", "") },
  {
    key: "brands",
    visible: true,
    heading: t("Choose your marque", "اختر علامتك"),
    intro: t("Brand-specific care for 2016+ models. Pick your car to see what we handle.", "عناية مخصصة لكل علامة لموديلات 2016 وأحدث. اختر سيارتك لترى ما نقدمه."),
  },
  {
    key: "services",
    visible: true,
    heading: t("What we do", "ما نقدمه"),
    intro: t("Six workshop disciplines under one roof in Al Quoz.", "ستة تخصصات تحت سقف واحد في القوز."),
  },
  {
    key: "process",
    visible: true,
    heading: t("How a visit works", "كيف تتم الزيارة"),
    intro: t("Inspect, explain, quote — then only the work you approve.", "نفحص ونشرح ونقدّم عرض السعر — ثم ننفذ ما توافق عليه فقط."),
  },
  {
    key: "team",
    visible: true,
    heading: t("The people in the workshop", "الفريق في الورشة"),
    intro: t("Meet the team that inspects, repairs and programmes your car.", "تعرّف على الفريق الذي يفحص سيارتك ويصلحها ويبرمجها."),
  },
  {
    key: "blog",
    visible: true,
    heading: t("From the workshop", "من الورشة"),
    intro: t("Recent articles and owner advice.", "أحدث المقالات ونصائح للملاك."),
  },
  {
    key: "location",
    visible: true,
    heading: t("Visit or message us", "زرنا أو راسلنا"),
    intro: t("Call, WhatsApp or send an enquiry — we reply with next steps.", "اتصل أو راسلنا عبر واتساب أو أرسل استفساراً — نرد عليك بالخطوات التالية."),
  },
]

const pageSeo = (titleEn: string, titleAr: string, descEn: string, descAr: string): SeoFields => ({
  title: t(titleEn, titleAr),
  description: t(descEn, descAr),
  ogImageId: null,
  noindex: false,
})

export const TEAM_SCAFFOLD_SIZE = 18
export const ILLUSTRATIVE_SEED = "illustrative-assets-v1"
export const HERO_CONCEPT_ID = "site-hero-concept"
export const illustrativePortraitId = (n: number) => `team-illustrative-${String(n).padStart(2, "0")}`
export const teamSlotId = (n: number) => `team-slot-${String(n).padStart(2, "0")}`

/**
 * Owner-supplied AI concept artwork (2026-10). Not photographs of SHWURX
 * premises, staff or customer cars; always captioned as illustrative.
 */
export function illustrativeMedia(): MediaAsset[] {
  const now = "2026-10-05T00:00:00.000Z"
  const hero: MediaAsset = {
    id: HERO_CONCEPT_ID,
    url: "/site/shwurx-workshop-facade-concept-illustration.webp",
    source: "ai_illustration",
    approval: "approved",
    alt: t(
      "Illustration of a SHWURX-branded workshop with a beige industrial exterior, purple trim and a black and lime sign, two sports cars inside the open service bay at sunset",
      "رسم توضيحي لورشة تحمل علامة شوركس بواجهة صناعية بيج وإطار بنفسجي ولافتة سوداء وخضراء ليمونية، وبداخل باب الصيانة المفتوح سيارتان رياضيتان عند الغروب",
    ),
    caption: t("Illustrative concept image — not a photograph of the workshop", "صورة توضيحية تصورية — ليست صورة فوتوغرافية للورشة"),
    tags: ["hero", "illustration"],
    width: 1672,
    height: 941,
    focalX: 66,
    focalY: 55,
    publicSafe: true,
    uploadedAt: now,
  }
  const portraits: MediaAsset[] = Array.from({ length: TEAM_SCAFFOLD_SIZE }, (_, i) => ({
    id: illustrativePortraitId(i + 1),
    url: `/site/team/illustrative-team-portrait-${String(i + 1).padStart(2, "0")}.webp`,
    source: "ai_illustration" as const,
    approval: "approved" as const,
    alt: t(
      `Illustrative AI-generated portrait ${i + 1} in a SHWURX uniform — not a staff photograph`,
      `صورة شخصية توضيحية مولّدة بالذكاء الاصطناعي رقم ${i + 1} بزي شوركس — ليست صورة لأحد الموظفين`,
    ),
    caption: t("Illustrative portrait — real profile coming soon", "صورة توضيحية — الملف الحقيقي قريباً"),
    tags: ["team", "illustration"],
    width: 256,
    height: 341,
    focalX: 50,
    focalY: 35,
    publicSafe: true,
    uploadedAt: now,
  }))
  return [hero, ...portraits]
}
export const BRAND_HERO_SEED = "brand-garage-heroes-v2"

/**
 * AI compositions of each marque outside the SHWURX facade (beige corrugated
 * exterior, purple trim, lime/black sign, open bay), generated from the owner's
 * facade reference. Illustrative only — never presented as customer jobs.
 */
export function brandHeroMedia(): MediaAsset[] {
  return brandHeroes.map((h) => ({
    id: brandHeroId(h.brandSlug),
    url: h.url,
    source: "ai_generated" as const,
    approval: "approved" as const,
    alt: t(h.alt.en, h.alt.ar),
    caption: t(h.caption.en, h.caption.ar),
    tags: ["brand", "hero", "illustration", h.brandSlug],
    width: h.width,
    height: h.height,
    focalX: h.focalX,
    focalY: h.focalY,
    publicSafe: true,
    uploadedAt: "2026-10-05T00:00:00.000Z",
  }))
}

export const TEAM_NAV_HEADER = { id: "nav-team", label: t("Team", "فريقنا"), href: "/team", visible: true }
export const TEAM_NAV_FOOTER = { id: "ft-team", label: t("Our team", "فريق العمل"), href: "/team", visible: true }

/** Empty, hidden draft slot. Holds no identity until the owner fills it in. */
export function blankTeamMember(id: string, sortOrder: number): TeamMember {
  return {
    id,
    name: t("", ""),
    jobTitle: t("", ""),
    bio: t("", ""),
    department: t("", ""),
    photoId: null,
    visible: false,
    archived: false,
    sortOrder,
    inStrip: true,
  }
}

export function seedTeamPage(): TeamPage {
  return {
    visible: true,
    title: t("Our team", "فريقنا"),
    intro: t(
      "The people who inspect, quote, repair and hand back your car at SHWURX.",
      "الأشخاص الذين يفحصون سيارتك ويقدّمون عرض السعر ويصلحونها ويسلّمونها لك في شوركس.",
    ),
    members: Array.from({ length: TEAM_SCAFFOLD_SIZE }, (_, i) => ({
      ...blankTeamMember(teamSlotId(i + 1), i),
      photoId: illustrativePortraitId(i + 1),
    })),
    showIllustrative: true,
    seo: pageSeo(
      "Our Team — SHWURX Auto Service Center",
      "فريقنا — مركز شوركس لخدمة السيارات",
      "Meet the SHWURX team in Al Quoz Industrial Area 2, Dubai.",
      "تعرّف على فريق شوركس في القوز الصناعية 2، دبي.",
    ),
  }
}

const LOGOS: [string, string][] = [
  ["porsche", "Porsche"],
  ["bentley", "Bentley"],
  ["rollsroyce", "Rolls-Royce"],
  ["lamborghini", "Lamborghini"],
  ["mercedes", "Mercedes-Benz"],
  ["audi", "Audi"],
  ["mclaren", "McLaren"],
  ["astonmartin", "Aston Martin"],
  ["ferrari", "Ferrari"],
  ["maserati", "Maserati"],
  ["landrover", "Land Rover"],
]

function media(): MediaAsset[] {
  const now = "2026-10-05T00:00:00.000Z"
  const logos: MediaAsset[] = LOGOS.map(([file, name]) => ({
    id: `logo-${file}`,
    url: `/brands/${file}.svg`,
    source: "brand_mark",
    approval: "approved",
    alt: t(`${name} logo`, `شعار ${name}`),
    caption: t("", ""),
    tags: ["logo"],
    width: null,
    height: null,
    focalX: 50,
    focalY: 50,
    publicSafe: true,
    uploadedAt: now,
  }))
  const site: MediaAsset[] = [
    ["site-hero", "/site/hero-porsche.png", "Porsche in the workshop", "سيارة بورش في الورشة"],
    ["site-about", "/site/about-tech.png", "Technician at work", "فني أثناء العمل"],
    ["site-team", "/site/workshop-team.png", "Workshop team", "فريق الورشة"],
    ["site-bay", "/images/workshop-lift-bay.png", "Workshop lift bay", "رافعة في الورشة"],
  ].map(([id, url, en, ar]) => ({
    id,
    url,
    source: "existing_site_asset" as const,
    // Shipped with the previous site; origin not verified as a SHWURX photo.
    approval: "needs_review" as const,
    alt: t(en, ar),
    caption: t("", ""),
    tags: ["site"],
    width: null,
    height: null,
    focalX: 50,
    focalY: 50,
    publicSafe: true,
    uploadedAt: now,
  }))
  return [...logos, ...site, ...illustrativeMedia(), ...brandHeroMedia()]
}

export function seedDocument(): WebsiteDocument {
  return {
    schemaVersion: 1,
    business: {
      name: t("SHWURX Auto Service Center", "مركز شوركس لخدمة السيارات"),
      phone: "",
      whatsapp: "",
      email: "",
      address: t("Al Quoz Industrial Area 2, Dubai, UAE", "منطقة القوز الصناعية 2، دبي، الإمارات"),
      area: t("Al Quoz Industrial Area 2", "القوز الصناعية 2"),
      mapUrl: "",
      hours: t("", ""),
      socials: [],
      logoId: null,
    },
    nav: {
      header: [
        { id: "nav-brands", label: t("Brands", "العلامات"), href: "/brands", visible: true },
        { id: "nav-services", label: t("Services", "الخدمات"), href: "/services", visible: true },
        { id: "nav-about", label: t("About", "من نحن"), href: "/about", visible: true },
        TEAM_NAV_HEADER,
        { id: "nav-blog", label: t("Blog", "المدونة"), href: "/blog", visible: true },
        { id: "nav-contact", label: t("Contact", "تواصل معنا"), href: "/contact", visible: true },
      ],
      footer: [
        { id: "ft-brands", label: t("All brands", "جميع العلامات"), href: "/brands", visible: true },
        { id: "ft-services", label: t("All services", "جميع الخدمات"), href: "/services", visible: true },
        TEAM_NAV_FOOTER,
        { id: "ft-contact", label: t("Contact", "تواصل معنا"), href: "/contact", visible: true },
        { id: "ft-privacy", label: t("Privacy", "الخصوصية"), href: "/privacy", visible: true },
      ],
    },
    pages: {
      home: {
        eyebrow: t("Independent premium car workshop · Al Quoz, Dubai", "ورشة مستقلة للسيارات الفاخرة · القوز، دبي"),
        title: t("Premium car repair, diagnosed before it is quoted.", "إصلاح السيارات الفاخرة، بتشخيص يسبق عرض السعر."),
        subtitle: t(
          "Mechanical, diagnostics, bodywork, paint and programming for 2016+ premium and sports cars. Inspection first, written quotation, and nothing done without your approval.",
          "ميكانيكا وتشخيص وهيكل ودهان وبرمجة للسيارات الفاخرة والرياضية موديلات 2016 وأحدث. الفحص أولاً، عرض سعر مكتوب، ولا يُنفّذ شيء دون موافقتك.",
        ),
        heroImageId: HERO_CONCEPT_ID,
        primaryCta: { label: t("Request a quote", "اطلب عرض سعر"), href: "/contact" },
        secondaryCta: { label: t("Book an inspection", "احجز فحصاً"), href: "/appointment" },
        highlights: [
          { id: "h1", title: t("2016+ premium & sports", "فاخرة ورياضية 2016+"), body: t("Our focus models", "الموديلات التي نركز عليها") },
          { id: "h2", title: t("Inspection first", "الفحص أولاً"), body: t("Diagnosis before quotation", "التشخيص قبل عرض السعر") },
          { id: "h3", title: t("Your approval", "موافقتك"), body: t("Nothing done without your OK", "لا شيء يُنفّذ دون موافقتك") },
        ],
        sections: HOME_SECTION_DEFAULTS.map((s) => structuredClone(s)),
        seo: pageSeo(
          "SHWURX — Premium Car Repair in Al Quoz, Dubai",
          "شوركس — إصلاح السيارات الفاخرة في القوز، دبي",
          "Independent repair, diagnostics, bodywork, paint and programming for 2016+ premium and sports cars in Al Quoz Industrial Area 2.",
          "إصلاح وتشخيص وهيكل ودهان وبرمجة مستقلة للسيارات الفاخرة والرياضية موديلات 2016 وأحدث في القوز الصناعية 2.",
        ),
      },
      about: {
        title: t("About SHWURX", "عن شوركس"),
        body: t(
          "SHWURX is an independent auto service center in Al Quoz Industrial Area 2, Dubai, focused on premium and sports vehicles. We inspect before we quote, explain what we find, and only carry out the work you approve.",
          "شوركس مركز مستقل لخدمة السيارات في منطقة القوز الصناعية 2 بدبي، يركز على السيارات الفاخرة والرياضية. نفحص قبل تقديم عرض السعر، ونشرح ما نجده، ولا ننفذ إلا الأعمال التي توافق عليها.",
        ),
        imageId: "site-about",
        seo: pageSeo(
          "About SHWURX Auto Service Center",
          "عن مركز شوركس لخدمة السيارات",
          "Independent premium car workshop in Al Quoz Industrial Area 2, Dubai.",
          "ورشة مستقلة للسيارات الفاخرة في القوز الصناعية 2، دبي.",
        ),
      },
      contact: {
        title: t("Contact SHWURX", "تواصل مع شوركس"),
        intro: t(
          "Call, WhatsApp or send an enquiry. Tell us the brand, model, year and what you need, and our team will get back to you.",
          "اتصل أو راسلنا عبر واتساب أو أرسل استفساراً. أخبرنا بالعلامة والموديل والسنة وما تحتاجه، وسيعاود فريقنا التواصل معك.",
        ),
        seo: pageSeo(
          "Contact SHWURX — Al Quoz, Dubai",
          "تواصل مع شوركس — القوز، دبي",
          "Call, WhatsApp or send an enquiry to SHWURX Auto Service Center in Al Quoz Industrial Area 2.",
          "اتصل أو راسل أو أرسل استفساراً إلى مركز شوركس لخدمة السيارات في القوز الصناعية 2.",
        ),
      },
      brandsIndex: {
        title: t("Brands we work on", "العلامات التي نعمل عليها"),
        intro: t(
          "Premium and sports vehicles, model years 2016 and newer. Choose your brand to see what we check and how we work.",
          "السيارات الفاخرة والرياضية موديلات 2016 وأحدث. اختر علامتك لترى ما نفحصه وطريقة عملنا.",
        ),
        seo: pageSeo(
          "Premium Car Brands We Repair in Dubai",
          "علامات السيارات الفاخرة التي نصلحها في دبي",
          "Porsche, Bentley, Rolls-Royce, Lamborghini, Mercedes-Benz, Audi, McLaren, Ferrari and more — 2016+ models in Al Quoz.",
          "بورش وبنتلي ورولز رويس ولامبورغيني ومرسيدس بنز وأودي وماكلارين وفيراري وغيرها — موديلات 2016 وأحدث في القوز.",
        ),
      },
      servicesIndex: {
        title: t("Services", "الخدمات"),
        intro: t(
          "Six service areas, each starting with inspection and a written quotation.",
          "ستة مجالات خدمة، تبدأ كلها بالفحص وعرض سعر مكتوب.",
        ),
        seo: pageSeo(
          "Premium Car Services in Al Quoz, Dubai",
          "خدمات السيارات الفاخرة في القوز، دبي",
          "Mechanical repair, diagnostics, bodywork, painting and programming for premium cars at SHWURX.",
          "الإصلاح الميكانيكي والتشخيص والهيكل والدهان والبرمجة للسيارات الفاخرة لدى شوركس.",
        ),
      },
      privacy: {
        title: t("Privacy", "الخصوصية"),
        body: t(
          "When you send an enquiry we store your name, phone number, vehicle details and message so our team can contact you about your request. We also record how you reached the website (for example the campaign link) to understand which advertising works. We do not sell your data. To ask for your enquiry to be deleted, contact us using the details on this website.",
          "عند إرسال استفسار نحفظ اسمك ورقم هاتفك وتفاصيل سيارتك ورسالتك حتى يتواصل معك فريقنا بخصوص طلبك. كما نسجّل الطريقة التي وصلت بها إلى الموقع (مثل رابط الحملة) لفهم الإعلانات المفيدة. لا نبيع بياناتك. لطلب حذف استفسارك تواصل معنا عبر بيانات التواصل في هذا الموقع.",
        ),
        seo: pageSeo("Privacy — SHWURX", "الخصوصية — شوركس", "How SHWURX handles enquiry data.", "كيف تتعامل شوركس مع بيانات الاستفسارات."),
      },
      team: seedTeamPage(),
      process: [
        { id: "p1", title: t("Tell us about the car", "أخبرنا عن السيارة"), body: t("Brand, model, year and what you notice — by form, call or WhatsApp.", "العلامة والموديل والسنة وما تلاحظه — عبر النموذج أو الاتصال أو واتساب.") },
        { id: "p2", title: t("Inspection", "الفحص"), body: t("We confirm the complaint and inspect the vehicle at our Al Quoz workshop.", "نتأكد من الشكوى ونفحص السيارة في ورشتنا بالقوز.") },
        { id: "p3", title: t("Written quotation", "عرض سعر مكتوب"), body: t("Each item is listed separately so you can decide.", "كل بند مذكور على حدة حتى تقرر.") },
        { id: "p4", title: t("Your approval", "موافقتك"), body: t("We only carry out what you approve.", "لا ننفذ إلا ما توافق عليه.") },
      ],
      custom: [],
    },
    brands: seedBrands(),
    services: seedServices(),
    media: media(),
    seo: {
      siteName: t("SHWURX Auto Service Center", "مركز شوركس لخدمة السيارات"),
      titleSuffix: t(" | SHWURX", " | شوركس"),
      defaultDescription: t(
        "Independent premium car repair in Al Quoz Industrial Area 2, Dubai.",
        "إصلاح مستقل للسيارات الفاخرة في القوز الصناعية 2، دبي.",
      ),
      defaultOgImageId: "site-hero",
      redirects: [],
    },
    forms: {
      enquiry: {
        heading: t("Send an enquiry", "أرسل استفساراً"),
        intro: t(
          "Tell us about the vehicle. Our team will contact you — this is an enquiry, not a confirmed booking.",
          "أخبرنا عن السيارة وسيتواصل معك فريقنا — هذا استفسار وليس حجزاً مؤكداً.",
        ),
        labels: {
          name: t("Your name", "الاسم"),
          phone: t("Mobile number", "رقم الجوال"),
          brand: t("Brand", "العلامة"),
          model: t("Model", "الموديل"),
          year: t("Year", "السنة"),
          service: t("Service", "الخدمة"),
          details: t("What do you need? (optional)", "ماذا تحتاج؟ (اختياري)"),
          submit: t("Send enquiry", "إرسال الاستفسار"),
        },
        privacyNote: t(
          "We use these details only to respond to your enquiry. See our privacy notice.",
          "نستخدم هذه البيانات فقط للرد على استفسارك. راجع إشعار الخصوصية.",
        ),
        successTitle: t("Enquiry received", "تم استلام الاستفسار"),
        successBody: t(
          "Thank you. Our team will contact you on the number you provided.",
          "شكراً لك. سيتواصل معك فريقنا على الرقم الذي أدخلته.",
        ),
        nextSteps: t(
          "If it is urgent, call or WhatsApp us directly.",
          "إن كان الأمر عاجلاً، اتصل بنا أو راسلنا عبر واتساب مباشرة.",
        ),
        enabled: true,
      },
    },
    analytics: structuredClone(DEFAULT_ANALYTICS),
    strings: { en: {}, ar: {} },
    images: {},
    appliedSeeds: [ILLUSTRATIVE_SEED, BRAND_HERO_SEED],
  }
}
