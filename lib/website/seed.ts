import type { MediaAsset, SeoFields, WebsiteDocument } from "./types"
import { seedBrands, t } from "./seed-brands"
import { seedServices } from "./seed-services"

const pageSeo = (titleEn: string, titleAr: string, descEn: string, descAr: string): SeoFields => ({
  title: t(titleEn, titleAr),
  description: t(descEn, descAr),
  ogImageId: null,
  noindex: false,
})

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
  return [...logos, ...site]
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
        { id: "nav-blog", label: t("Blog", "المدونة"), href: "/blog", visible: true },
        { id: "nav-contact", label: t("Contact", "تواصل معنا"), href: "/contact", visible: true },
      ],
      footer: [
        { id: "ft-brands", label: t("All brands", "جميع العلامات"), href: "/brands", visible: true },
        { id: "ft-services", label: t("All services", "جميع الخدمات"), href: "/services", visible: true },
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
        heroImageId: "site-hero",
        sections: [
          { key: "hero", visible: true },
          { key: "brands", visible: true },
          { key: "services", visible: true },
          { key: "process", visible: true },
          { key: "location", visible: true },
          { key: "blog", visible: true },
        ],
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
    strings: { en: {}, ar: {} },
    images: {},
  }
}
