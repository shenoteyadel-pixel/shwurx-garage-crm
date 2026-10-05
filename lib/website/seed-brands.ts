import type { Brand, Faq, L10n, ModelScope, SeoFields, TextItem } from "./types"

/**
 * Default content for the 15 campaign brands (model years 2016 and newer).
 * Imported once into the editable draft; after that the Website Control Center
 * owns it. Wording is deliberately assessment-based: SHWURX is an independent
 * center and makes no dealer, factory or warranty claims.
 */

export const t = (en: string, ar: string): L10n => ({ en, ar })

let seq = 0
const uid = (p: string) => `${p}-${(++seq).toString(36)}`

const k = (enTitle: string, arTitle: string, enBody: string, arBody: string): TextItem => ({
  id: uid("k"),
  title: t(enTitle, arTitle),
  body: t(enBody, arBody),
})
const f = (qEn: string, qAr: string, aEn: string, aAr: string): Faq => ({ id: uid("faq"), q: t(qEn, qAr), a: t(aEn, aAr) })
const m = (name: string, yearFrom = 2016, yearTo: number | null = null): ModelScope => ({
  id: uid("m"),
  name,
  yearFrom,
  yearTo,
  note: t("", ""),
})
const seo = (nameEn: string, nameAr: string, focusEn: string, focusAr: string): SeoFields => ({
  title: t(`${nameEn} Repair & Service in Al Quoz, Dubai`, `صيانة وإصلاح ${nameAr} في القوز، دبي`),
  description: t(
    `Independent ${nameEn} repair, diagnostics and maintenance for 2016+ models at SHWURX, Al Quoz Industrial Area 2. ${focusEn}`,
    `صيانة وإصلاح وتشخيص ${nameAr} موديلات 2016 وأحدث لدى شوركس في منطقة القوز الصناعية 2. ${focusAr}`,
  ),
  ogImageId: null,
  noindex: false,
})

export const brandHeroId = (slug: string) => `brand-hero-${slug}`

type BrandSeed = Omit<Brand, "id" | "heroImageId" | "galleryIds" | "caseStudies" | "visible" | "yearFrom" | "seo"> & {
  seo: [string, string]
}

const ALL_CORE = ["mechanical-repair", "diagnostics", "bodywork", "painting"]
const WITH_PROG = [...ALL_CORE, "online-programming", "offline-programming"]

const SEEDS: BrandSeed[] = [
  {
    slug: "porsche",
    name: t("Porsche", "بورش"),
    kind: "manufacturer",
    parentName: null,
    collections: ["sports"],
    logoId: "logo-porsche",
    models: [m("911"), m("718 Boxster / Cayman"), m("Cayenne"), m("Macan"), m("Panamera"), m("Taycan", 2020)],
    intro: t(
      "Porsche owners in Dubai expect a workshop that understands how the 911, Cayenne, Macan, Panamera and Taycan are built differently. At SHWURX in Al Quoz we inspect your Porsche, read the fault data, explain what we find and give you a written quotation before any work starts.",
      "يتوقع مالكو بورش في دبي ورشة تفهم الفروق بين 911 وكايين وماكان وباناميرا وتايكان. في شوركس بالقوز نفحص سيارتك ونقرأ بيانات الأعطال ونشرح لك ما وجدناه ونقدّم عرض سعر مكتوباً قبل البدء بأي عمل.",
    ),
    knowledge: [
      k(
        "PDK and manual gearboxes",
        "ناقل الحركة PDK واليدوي",
        "Shift quality, clutch adaptation values and fluid condition are checked before any gearbox repair is recommended. Many PDK complaints start with software adaptations or sensors rather than hardware.",
        "نفحص جودة التبديل وقيم تكيّف القابض وحالة الزيت قبل التوصية بأي إصلاح لناقل الحركة. كثير من شكاوى PDK تبدأ من التكيّفات البرمجية أو الحساسات وليس من القطع الميكانيكية.",
      ),
      k(
        "Air suspension and PASM",
        "التعليق الهوائي ونظام PASM",
        "Cayenne, Panamera and Macan models with air suspension are tested for leaks, compressor duty and ride-height calibration. Dubai heat is hard on rubber air springs and lines.",
        "نختبر موديلات كايين وباناميرا وماكان المزودة بتعليق هوائي للكشف عن التسريب وأداء الضاغط ومعايرة الارتفاع. حرارة دبي تؤثر على وسائد الهواء والخطوط المطاطية.",
      ),
      k(
        "Cooling under Gulf conditions",
        "التبريد في ظروف الخليج",
        "Coolant lines, radiators and thermostat housings on high-output engines work hard in summer traffic. We pressure-test the system and check for seepage before it becomes overheating.",
        "تعمل خطوط سائل التبريد والمشعات وأغطية منظم الحرارة في المحركات عالية الأداء تحت ضغط كبير في زحام الصيف. نختبر النظام تحت الضغط ونكشف الرشح قبل أن يتحول إلى ارتفاع في الحرارة.",
      ),
      k(
        "Taycan and high-voltage systems",
        "تايكان والأنظمة عالية الجهد",
        "Electric and hybrid Porsche models need an assessment of what can be safely diagnosed and repaired locally. We tell you clearly which work we can carry out and which we cannot.",
        "تحتاج موديلات بورش الكهربائية والهجينة إلى تقييم لما يمكن تشخيصه وإصلاحه بأمان محلياً. نوضح لك بصراحة الأعمال التي نستطيع تنفيذها والتي لا نستطيع.",
      ),
    ],
    serviceSlugs: WITH_PROG,
    faqs: [
      f(
        "Can you service my Porsche without affecting the service history?",
        "هل يمكنكم صيانة سيارتي بورش دون التأثير على سجل الصيانة؟",
        "We record every job on a job card with parts, readings and photos you can keep. Whether third-party servicing affects any warranty you hold depends on your warranty terms, so please check them before booking.",
        "نسجّل كل عمل في بطاقة عمل تتضمن القطع والقراءات والصور ويمكنك الاحتفاظ بها. تأثير الصيانة لدى ورشة مستقلة على أي ضمان لديك يعتمد على شروط الضمان، لذا يرجى مراجعتها قبل الحجز.",
      ),
      f(
        "My Porsche shows a warning light. Can I drive it to Al Quoz?",
        "تظهر لمبة تحذير في سيارتي بورش. هل يمكنني قيادتها إلى القوز؟",
        "Send us the message or a photo of the dashboard on WhatsApp first. Red warnings such as oil pressure or coolant usually mean you should stop and arrange recovery instead of driving.",
        "أرسل لنا الرسالة أو صورة لوحة العدادات عبر واتساب أولاً. التحذيرات الحمراء مثل ضغط الزيت أو سائل التبريد تعني غالباً أن عليك التوقف وترتيب سحب السيارة بدلاً من قيادتها.",
      ),
      f(
        "Do you work on older Porsche models?",
        "هل تعملون على موديلات بورش الأقدم؟",
        "Our focus for this page is 2016 and newer models. Tell us your model and year and we will tell you honestly whether we are the right workshop for it.",
        "تركيز هذه الصفحة على موديلات 2016 وأحدث. أخبرنا بالموديل والسنة وسنخبرك بصراحة إن كنا الورشة المناسبة لسيارتك.",
      ),
    ],
    seo: ["PDK, air suspension and cooling diagnostics with a written quote.", "تشخيص ناقل PDK والتعليق الهوائي والتبريد مع عرض سعر مكتوب."],
  },
  {
    slug: "bentley",
    name: t("Bentley", "بنتلي"),
    kind: "manufacturer",
    parentName: null,
    collections: [],
    logoId: "logo-bentley",
    models: [m("Continental GT / GTC"), m("Flying Spur"), m("Bentayga")],
    intro: t(
      "A Bentley combines heavy luxury equipment with powerful W12 and V8 engines, so faults often involve several systems at once. SHWURX diagnoses Continental GT, Flying Spur and Bentayga models from 2016 onwards and explains the cause before quoting.",
      "تجمع بنتلي بين تجهيزات فاخرة ثقيلة ومحركات W12 وV8 قوية، لذلك كثيراً ما تتداخل الأعطال بين عدة أنظمة. نشخّص في شوركس موديلات كونتيننتال GT وفلاينج سبير وبنتايجا من 2016 فما فوق ونشرح السبب قبل تقديم عرض السعر.",
    ),
    knowledge: [
      k(
        "Air suspension and ride control",
        "التعليق الهوائي والتحكم بالقيادة",
        "Bentley air springs, valve blocks and compressors are checked as one system so a replaced part is not undone by a leak elsewhere.",
        "نفحص وسائد الهواء وكتل الصمامات والضاغط في بنتلي كنظام واحد، حتى لا يضيع إصلاح قطعة بسبب تسريب في مكان آخر.",
      ),
      k(
        "Electrical and comfort modules",
        "الوحدات الكهربائية ووحدات الراحة",
        "Battery health matters on cars with many control units. Low voltage can cause misleading fault codes, so we test the charging system before chasing individual modules.",
        "صحة البطارية مهمة في السيارات التي تحتوي على وحدات تحكم كثيرة. الجهد المنخفض قد يسبب رموز أعطال مضللة، لذلك نختبر نظام الشحن قبل تتبع كل وحدة على حدة.",
      ),
      k(
        "Brakes on heavy luxury cars",
        "المكابح في السيارات الفاخرة الثقيلة",
        "Weight and performance put high load on discs and pads. We measure wear and disc condition and quote the options available for your car.",
        "الوزن والأداء يضعان حملاً كبيراً على الأقراص والفحمات. نقيس التآكل وحالة الأقراص ونقدّم لك الخيارات المتاحة لسيارتك.",
      ),
    ],
    serviceSlugs: WITH_PROG,
    faqs: [
      f(
        "Can you diagnose a Bentayga suspension warning?",
        "هل يمكنكم تشخيص تحذير التعليق في بنتايجا؟",
        "Yes. We read the fault memory, check pressures and inspect for leaks, then explain whether the cause is a spring, valve, compressor or sensor.",
        "نعم. نقرأ ذاكرة الأعطال ونفحص الضغوط ونبحث عن التسريبات، ثم نوضح إن كان السبب وسادة أو صماماً أو ضاغطاً أو حساساً.",
      ),
      f(
        "Do you repair Bentley bodywork and paint?",
        "هل تصلحون هيكل ودهان بنتلي؟",
        "Yes, we carry out panel repair and painting with colour matching to your paint code. We assess the damage first and quote before starting.",
        "نعم، ننفذ إصلاح الألواح والدهان مع مطابقة اللون حسب كود الطلاء. نقيّم الضرر أولاً ونقدّم عرض السعر قبل البدء.",
      ),
      f(
        "How do I start?",
        "كيف أبدأ؟",
        "Send the model, year and what you notice using the form or WhatsApp. We reply to arrange an inspection at our Al Quoz workshop.",
        "أرسل الموديل والسنة وما تلاحظه عبر النموذج أو واتساب، وسنرد عليك لترتيب فحص في ورشتنا بالقوز.",
      ),
    ],
    seo: ["Air suspension, electrical and brake diagnosis.", "تشخيص التعليق الهوائي والكهرباء والمكابح."],
  },
  {
    slug: "rolls-royce",
    name: t("Rolls-Royce", "رولز رويس"),
    kind: "manufacturer",
    parentName: null,
    collections: [],
    logoId: "logo-rollsroyce",
    models: [m("Ghost"), m("Phantom"), m("Cullinan", 2018), m("Wraith"), m("Dawn"), m("Spectre", 2023)],
    intro: t(
      "Rolls-Royce owners usually notice a problem as a change in refinement: a new noise, a firmer ride or a hesitation. At SHWURX we take the time to reproduce the complaint, diagnose it properly and agree the plan with you before work begins.",
      "عادةً يلاحظ مالك رولز رويس المشكلة كتغيّر في الرقي: صوت جديد أو قيادة أكثر صلابة أو تردد في الاستجابة. في شوركس نأخذ الوقت لإعادة ظهور الشكوى وتشخيصها بدقة والاتفاق معك على الخطة قبل البدء بالعمل.",
    ),
    knowledge: [
      k(
        "Self-levelling air suspension",
        "التعليق الهوائي ذاتي الموازنة",
        "Ride comfort depends on healthy air springs, height sensors and compressor. We check the whole circuit and the stored calibration.",
        "تعتمد راحة القيادة على سلامة وسائد الهواء وحساسات الارتفاع والضاغط. نفحص الدائرة كاملة والمعايرة المحفوظة.",
      ),
      k(
        "V12 cooling and ancillaries",
        "تبريد محرك V12 وملحقاته",
        "Large V12 engines generate a lot of heat in Dubai summers. Hoses, coolant pipes and fans are inspected as part of every diagnosis.",
        "تولّد محركات V12 الكبيرة حرارة عالية في صيف دبي. نفحص الخراطيم وأنابيب التبريد والمراوح ضمن كل تشخيص.",
      ),
      k(
        "Interior and electrical comfort",
        "الراحة الداخلية والكهرباء",
        "Doors, seats and climate systems are run by many modules. We trace electrical faults methodically instead of replacing parts on guesswork.",
        "تتحكم وحدات كثيرة بالأبواب والمقاعد والتكييف. نتتبع الأعطال الكهربائية بطريقة منهجية بدلاً من تبديل القطع بالتخمين.",
      ),
    ],
    serviceSlugs: WITH_PROG,
    faqs: [
      f(
        "Can you collect my Rolls-Royce?",
        "هل يمكنكم استلام سيارتي رولز رويس؟",
        "Ask us when you enquire. Pickup depends on location and availability, and we confirm the arrangement with you directly.",
        "اسألنا عند التواصل. يعتمد الاستلام على الموقع والتوفر، ونؤكد الترتيب معك مباشرة.",
      ),
      f(
        "Will you tell me the cost before repairing?",
        "هل ستخبرونني بالتكلفة قبل الإصلاح؟",
        "Yes. After inspection you receive a quotation and we only proceed with the items you approve.",
        "نعم. بعد الفحص تستلم عرض سعر ولا ننفذ إلا البنود التي توافق عليها.",
      ),
      f(
        "Do you work on the Spectre?",
        "هل تعملون على سبيكتر؟",
        "Electric models need an assessment of what can be safely handled locally. Contact us with the details and we will answer honestly.",
        "تحتاج الموديلات الكهربائية إلى تقييم لما يمكن التعامل معه بأمان محلياً. تواصل معنا بالتفاصيل وسنجيبك بصراحة.",
      ),
    ],
    seo: ["Suspension, V12 cooling and electrical diagnosis.", "تشخيص التعليق وتبريد V12 والكهرباء."],
  },
  {
    slug: "lamborghini",
    name: t("Lamborghini", "لامبورغيني"),
    kind: "manufacturer",
    parentName: null,
    collections: ["sports"],
    logoId: "logo-lamborghini",
    models: [m("Huracán"), m("Aventador", 2016, 2022), m("Urus", 2018), m("Revuelto", 2024)],
    intro: t(
      "Huracán, Aventador and Urus share a performance focus but are very different cars to work on. SHWURX inspects Lamborghini models from 2016 onwards in Al Quoz, with a clear diagnosis and written quotation before any repair.",
      "تشترك هوراكان وأفنتادور وأوروس في التركيز على الأداء، لكنها سيارات مختلفة جداً عند العمل عليها. نفحص في شوركس بالقوز موديلات لامبورغيني من 2016 فما فوق، مع تشخيص واضح وعرض سعر مكتوب قبل أي إصلاح.",
    ),
    knowledge: [
      k(
        "Gearbox and clutch behaviour",
        "سلوك ناقل الحركة والقابض",
        "Dual-clutch and ISR gearboxes are assessed with live data and adaptation values before deciding whether hardware repair is needed.",
        "نقيّم ناقل الحركة مزدوج القابض وناقل ISR باستخدام البيانات الحية وقيم التكيّف قبل تحديد الحاجة إلى إصلاح ميكانيكي.",
      ),
      k(
        "Front lift and suspension",
        "رافعة المقدمة والتعليق",
        "Nose-lift systems and adaptive dampers are checked for leaks and correct operation, which matters on Dubai ramps and speed bumps.",
        "نفحص أنظمة رفع المقدمة والممتصات التكيفية للكشف عن التسريب والتأكد من عملها بشكل صحيح، وهذا مهم مع منحدرات ومطبات دبي.",
      ),
      k(
        "Heat management",
        "إدارة الحرارة",
        "Mid-engine cars run hot in summer traffic. We inspect cooling, heat shields and wiring near the engine bay.",
        "تعمل السيارات ذات المحرك الوسطي بحرارة عالية في زحام الصيف. نفحص التبريد والدروع الحرارية والأسلاك القريبة من حجرة المحرك.",
      ),
    ],
    serviceSlugs: WITH_PROG,
    faqs: [
      f(
        "Can you repair carbon or aluminium body panels?",
        "هل يمكنكم إصلاح الألواح الكربونية أو الألمنيوم؟",
        "We assess panel material and damage first. Some parts can be repaired; others need replacement. You get the options in the quotation.",
        "نقيّم مادة اللوح والضرر أولاً. بعض القطع يمكن إصلاحها وبعضها يحتاج إلى استبدال، وتجد الخيارات في عرض السعر.",
      ),
      f(
        "Do you service the Urus?",
        "هل تخدمون أوروس؟",
        "Yes, Urus maintenance, diagnostics and repair are within our scope, subject to inspection of the specific fault.",
        "نعم، صيانة أوروس وتشخيصها وإصلاحها ضمن نطاق عملنا، بحسب فحص العطل المحدد.",
      ),
      f(
        "What should I send before visiting?",
        "ماذا أرسل قبل الزيارة؟",
        "Model, year, the warning or symptom and when it happens. A short video of a noise is very helpful.",
        "الموديل والسنة والتحذير أو العرض ومتى يظهر. مقطع فيديو قصير للصوت مفيد جداً.",
      ),
    ],
    seo: ["Gearbox, lift system and heat-related diagnosis.", "تشخيص ناقل الحركة ونظام الرفع والمشكلات الحرارية."],
  },
  {
    slug: "mercedes-benz",
    name: t("Mercedes-Benz", "مرسيدس بنز"),
    kind: "manufacturer",
    parentName: null,
    collections: [],
    logoId: "logo-mercedes",
    models: [m("C-Class"), m("E-Class"), m("S-Class"), m("G-Class"), m("GLE / GLS"), m("Mercedes-AMG GT")],
    intro: t(
      "From the C-Class to the G-Class and AMG models, Mercedes-Benz vehicles share complex electronics and many driver-assistance systems. SHWURX diagnoses 2016+ Mercedes-Benz models in Al Quoz and quotes clearly before repair.",
      "من الفئة C إلى الفئة G وموديلات AMG، تشترك سيارات مرسيدس بنز في إلكترونيات معقدة وأنظمة مساعدة كثيرة للسائق. نشخّص في شوركس بالقوز موديلات مرسيدس بنز 2016 وأحدث ونقدّم عرض سعر واضحاً قبل الإصلاح.",
    ),
    knowledge: [
      k(
        "AIRMATIC and active suspension",
        "تعليق AIRMATIC والتعليق النشط",
        "Air suspension faults on E-, S- and GLE/GLS-Class are diagnosed by testing each corner, the compressor and the valve block before replacing parts.",
        "نشخّص أعطال التعليق الهوائي في الفئات E وS وGLE/GLS باختبار كل زاوية والضاغط وكتلة الصمامات قبل استبدال أي قطعة.",
      ),
      k(
        "9G-TRONIC and AMG gearboxes",
        "ناقل 9G-TRONIC ونواقل AMG",
        "Harsh shifts are often linked to fluid condition, software or adaptations. We check these before recommending gearbox repair.",
        "التبديل الخشن مرتبط غالباً بحالة الزيت أو البرمجة أو التكيّفات. نفحص ذلك قبل التوصية بإصلاح ناقل الحركة.",
      ),
      k(
        "Driver-assistance after repairs",
        "أنظمة المساعدة بعد الإصلاح",
        "After windscreen, bumper or suspension work, cameras and radar may need calibration. We tell you when this applies and whether we can do it for your car.",
        "بعد تغيير الزجاج أو الصدام أو أعمال التعليق قد تحتاج الكاميرات والرادار إلى معايرة. نخبرك متى ينطبق ذلك وإن كنا نستطيع تنفيذه لسيارتك.",
      ),
    ],
    serviceSlugs: WITH_PROG,
    faqs: [
      f(
        "Can you do the A or B service on my Mercedes?",
        "هل يمكنكم تنفيذ الصيانة A أو B لسيارتي مرسيدس؟",
        "Yes. Tell us what the dashboard service indicator shows and we will prepare the maintenance items and quote before the visit.",
        "نعم. أخبرنا بما يظهره مؤشر الصيانة في لوحة العدادات وسنجهز بنود الصيانة وعرض السعر قبل الزيارة.",
      ),
      f(
        "My G-Class has an electrical fault. Can you find it?",
        "سيارتي الفئة G فيها عطل كهربائي. هل يمكنكم إيجاده؟",
        "We start with battery and charging tests, then read all modules and trace the circuit. You get an explanation of the cause before repair.",
        "نبدأ باختبار البطارية ونظام الشحن، ثم نقرأ جميع الوحدات ونتتبع الدائرة. تحصل على شرح للسبب قبل الإصلاح.",
      ),
      f(
        "Do you work on AMG models?",
        "هل تعملون على موديلات AMG؟",
        "Yes, AMG maintenance and repair are within our scope. Specific programming work depends on assessment of the vehicle and system.",
        "نعم، صيانة وإصلاح موديلات AMG ضمن نطاقنا. أعمال البرمجة المحددة تعتمد على تقييم السيارة والنظام.",
      ),
    ],
    seo: ["AIRMATIC, gearbox and electrical diagnosis.", "تشخيص AIRMATIC وناقل الحركة والكهرباء."],
  },
  {
    slug: "audi",
    name: t("Audi", "أودي"),
    kind: "manufacturer",
    parentName: null,
    collections: [],
    logoId: "logo-audi",
    models: [m("A6 / A7"), m("A8"), m("Q7 / Q8"), m("RS 6 / RS 7"), m("R8"), m("e-tron GT", 2021)],
    intro: t(
      "Audi models combine quattro drivetrains, S tronic gearboxes and dense electronics. At SHWURX we diagnose 2016+ Audi models in Al Quoz, from the Q7 and A8 to RS models and the R8.",
      "تجمع موديلات أودي بين نظام الدفع الرباعي كواترو وناقل S tronic وإلكترونيات كثيفة. نشخّص في شوركس بالقوز موديلات أودي 2016 وأحدث، من Q7 وA8 إلى موديلات RS وR8.",
    ),
    knowledge: [
      k(
        "S tronic and tiptronic",
        "ناقل S tronic وتيبترونيك",
        "Judder, slipping or delayed engagement are checked with live data and fluid inspection first.",
        "نفحص الاهتزاز أو الانزلاق أو تأخر التعشيق بالبيانات الحية وفحص الزيت أولاً.",
      ),
      k(
        "Cooling and turbo systems",
        "أنظمة التبريد والتيربو",
        "Turbocharged engines are sensitive to coolant and oil condition in hot climates. We pressure-test cooling and inspect boost hoses.",
        "المحركات المزودة بتيربو حساسة لحالة سائل التبريد والزيت في الأجواء الحارة. نختبر التبريد تحت الضغط ونفحص خراطيم الضغط.",
      ),
      k(
        "Electronics and coding",
        "الإلكترونيات والترميز",
        "Replacing modules, batteries or sensors may require coding or adaptation. Whether we can do this depends on the model and system, which we confirm during assessment.",
        "قد يتطلب تبديل الوحدات أو البطاريات أو الحساسات ترميزاً أو تكييفاً. إمكانية تنفيذ ذلك تعتمد على الموديل والنظام، ونؤكدها أثناء التقييم.",
      ),
    ],
    serviceSlugs: WITH_PROG,
    faqs: [
      f(
        "Does a new battery need coding on my Audi?",
        "هل تحتاج البطارية الجديدة إلى ترميز في سيارتي أودي؟",
        "On many Audi models the battery is registered to the energy management system. We check this when replacing it.",
        "في كثير من موديلات أودي تُسجّل البطارية في نظام إدارة الطاقة. نتحقق من ذلك ��ند الاستبدال.",
      ),
      f(
        "Can you repair a dented RS 6 panel?",
        "هل يمكنكم إصلاح انبعاج في لوح RS 6؟",
        "We assess the dent, material and paint condition and quote panel repair or replacement options.",
        "نقيّم الانبعاج والمادة وحالة الطلاء ونقدّم خيارات إصلاح اللوح أو استبداله.",
      ),
      f(
        "Do you work on the R8?",
        "هل تعملون على R8؟",
        "Yes, the R8 is within our scope for diagnosis, maintenance and repair, subject to inspection.",
        "نعم، R8 ضمن نطاقنا للتشخيص والصيانة والإصلاح بحسب الفحص.",
      ),
    ],
    seo: ["S tronic, cooling and coding assessment.", "تقييم S tronic والتبريد والترميز."],
  },
  {
    slug: "lotus",
    name: t("Lotus", "لوتس"),
    kind: "manufacturer",
    parentName: null,
    collections: ["sports"],
    logoId: null,
    models: [m("Evora", 2016, 2021), m("Exige", 2016, 2021), m("Elise", 2016, 2021), m("Emira", 2022), m("Eletre", 2023)],
    intro: t(
      "Lotus cars are light, precise and driven hard, which means suspension geometry, brakes and cooling matter a lot. SHWURX inspects 2016+ Lotus models in Al Quoz and explains findings before quoting.",
      "سيارات لوتس خفيفة ودقيقة وتُقاد بقوة، لذلك تهمّ هندسة التعليق والمكابح والتبريد كثيراً. نفحص في شوركس بالقوز موديلات لوتس 2016 وأحدث ونشرح النتائج قبل تقديم عرض السعر.",
    ),
    knowledge: [
      k(
        "Chassis and geometry",
        "الهيكل وهندسة العجلات",
        "Bonded aluminium chassis and sensitive geometry mean we check alignment and suspension condition carefully after any knock.",
        "الهيكل الألمنيوم الملصوق وحساسية هندسة العجلات تعني أننا نفحص الضبط وحالة التعليق بعناية بعد أي صدمة.",
      ),
      k(
        "Cooling in traffic",
        "التبريد في الزحام",
        "Mid-engine layouts rely on long coolant runs to front radiators. We inspect for air locks, leaks and fan operation.",
        "يعتمد تصميم المحرك الوسطي على خطوط تبريد طويلة إلى المشعات الأمامية. نفحص وجود الهواء في الدائرة والتسريبات وعمل المراوح.",
      ),
      k(
        "Composite body panels",
        "ألواح الهيكل المركّبة",
        "Composite panels are repaired differently from steel. We assess the damage and explain repair or replacement options.",
        "تُصلح الألواح المركّبة بطريقة مختلفة عن الفولاذ. نقيّم الضرر ونشرح خيارات الإصلاح أو الاستبدال.",
      ),
    ],
    serviceSlugs: ALL_CORE,
    faqs: [
      f(
        "Can you maintain my Emira?",
        "هل يمكنكم صيانة إميرا؟",
        "Yes, maintenance and mechanical repair are within scope. Contact us with the model year and mileage.",
        "نعم، الصيانة والإصلاح الميكانيكي ضمن نطاقنا. تواصل معنا بسنة الموديل والمسافة المقطوعة.",
      ),
      f(
        "Do you handle the Eletre?",
        "هل تتعاملون مع إليتر؟",
        "Electric models need an assessment of what can be safely handled. Send us the details and we will answer honestly.",
        "تحتاج الموديلات الكهربائية إلى تقييم لما يمكن التعامل معه بأمان. أرسل لنا التفاصيل وسنجيبك بصراحة.",
      ),
      f(
        "Can you fix a cracked front clam?",
        "هل يمكنكم إصلاح شق في الغطاء الأمامي؟",
        "We assess the damage first; the quote will show whether repair or replacement is the better option.",
        "نقيّم الضرر أولاً، وسيوضح عرض السعر إن كان الإصلاح أو الاستبدال هو الخيار الأفضل.",
      ),
    ],
    seo: ["Geometry, cooling and composite panel assessment.", "تقييم هندسة العجلات والتبريد والألواح المركّبة."],
  },
  {
    slug: "mclaren",
    name: t("McLaren", "ماكلارين"),
    kind: "manufacturer",
    parentName: null,
    collections: ["sports"],
    logoId: "logo-mclaren",
    models: [m("570S / 540C / 570GT", 2016, 2021), m("720S", 2017, 2023), m("750S", 2023), m("GT", 2019), m("Artura", 2022)],
    intro: t(
      "McLaren cars use carbon tubs, hydraulic suspension and twin-turbo engines that need careful diagnosis. SHWURX inspects 2016+ McLaren models in Al Quoz, explains the cause and quotes before any repair.",
      "تستخدم سيارات ماكلارين هياكل كربونية وتعليقاً هيدروليكياً ومحركات تيربو مزدوج تحتاج إلى تشخيص دقيق. نفحص في شوركس بالقوز موديلات ماكلارين 2016 وأحدث ونشرح السبب ونقدّم عرض السعر قبل أي إصلاح.",
    ),
    knowledge: [
      k(
        "Hydraulic suspension",
        "التعليق الهيدروليكي",
        "Linked hydraulic suspension on models such as the 720S is checked for pressure, leaks and accumulator condition.",
        "نفحص التعليق الهيدروليكي المترابط في موديلات مثل 720S من حيث الض��ط والتسريب وحالة المراكم.",
      ),
      k(
        "Twin-turbo V8 heat",
        "حرارة محرك V8 بتيربو مزدوج",
        "Turbo and exhaust heat affects nearby wiring and coolant lines. Inspection covers these areas as standard.",
        "تؤثر حرارة التيربو والعادم على الأسلاك وخطوط التبريد القريبة، ويشمل الفحص هذه المناطق دائماً.",
      ),
      k(
        "Nose lift and low clearance",
        "رفع المقدمة والخلوص المنخفض",
        "Front lift systems are tested for leaks and correct operation, and the underbody is inspected for impact damage.",
        "نختبر أنظمة رفع المقدمة للكشف عن التسريب والتأكد من عملها، ونفحص أسفل السيارة بحثاً عن أضرار الاصطدام.",
      ),
    ],
    serviceSlugs: WITH_PROG,
    faqs: [
      f(
        "Can you repair McLaren body damage?",
        "هل يمكنكم إصلاح أضرار هيكل ماكلارين؟",
        "We assess panel type and damage and explain whether repair or replacement is appropriate before quoting.",
        "نقيّم نوع اللوح والضرر ونوضح إن كان الإصلاح أو الاستبدال مناسباً قبل تقديم عرض السعر.",
      ),
      f(
        "My Artura shows a hybrid warning.",
        "تظهر في سيارتي أرتورا رسالة تحذير خاصة بنظام الهجين.",
        "Hybrid systems need assessment of what can be safely diagnosed locally. Send the warning message and we will advise.",
        "تحتاج الأنظمة الهجينة إلى تقييم لما يمكن تشخيصه بأمان محلياً. أرسل رسالة التحذير وسننصحك.",
      ),
      f(
        "Do you need the car for a long time?",
        "هل تحتاجون السيارة لفترة طويلة؟",
        "It depends on the fault and parts availability. We give you an estimate with the quotation and update you during the job.",
        "يعتمد ذلك على العطل وتوفر القطع. نعطيك تقديراً مع عرض السعر ونطلعك على التقدم أثناء العمل.",
      ),
    ],
    seo: ["Hydraulic suspension and twin-turbo diagnosis.", "تشخيص التعليق الهيدروليكي والتيربو المزدوج."],
  },
  {
    slug: "aston-martin",
    name: t("Aston Martin", "أستون مارتن"),
    kind: "manufacturer",
    parentName: null,
    collections: ["sports"],
    logoId: "logo-astonmartin",
    models: [m("DB11", 2016, 2023), m("DB12", 2023), m("DBS Superleggera", 2018), m("Vantage", 2018), m("DBX", 2020)],
    intro: t(
      "Aston Martin blends hand-finished interiors with V8 and V12 performance. SHWURX inspects DB11, DBS, Vantage and DBX models in Al Quoz, with clear explanations and a written quotation before work.",
      "تجمع أستون مارتن بين مقصورات مشغولة يدوياً وأداء محركات V8 وV12. نفحص في شوركس بالقوز موديلات DB11 وDBS وفانتاج وDBX، مع شرح واضح وعرض سعر مكتوب قبل العمل.",
    ),
    knowledge: [
      k(
        "Electrical and infotainment",
        "الكهرباء والنظام الترفيهي",
        "Low battery voltage often causes multiple warnings at once. We test the battery and charging before diagnosing modules.",
        "انخفاض جهد البطارية يسبب غالباً ظهور عدة تحذيرات معاً. نختبر البطارية والشحن قبل تشخيص الوحدات.",
      ),
      k(
        "Cooling and heat soak",
        "التبريد والحرارة المتراكمة",
        "Front-mid engine cars can heat-soak in traffic. We inspect fans, coolant and engine bay insulation.",
        "قد تتراكم الحرارة في السيارات ذات المحرك الأمامي الوسطي أثناء الزحام. نفحص المراوح وسائل التبريد وعزل حجرة المحرك.",
      ),
      k(
        "Paint and finish",
        "الطلاء والتشطيب",
        "Deep metallic and special colours need careful matching. We match to the paint code and test panels before final spraying.",
        "تحتاج الألوان المعدنية العميقة والخاصة إلى مطابقة دقيقة. نطابق حسب كود الطلاء ونجرب على ألواح اختبار قبل الرش النهائي.",
      ),
    ],
    serviceSlugs: WITH_PROG,
    faqs: [
      f(
        "Can you match my Aston Martin's paint?",
        "هل يمكنكم مطابقة طلاء سيارتي أستون مارتن؟",
        "We match using the paint code and spray-out tests, then assess the result in daylight before refinishing.",
        "نطابق باستخدام كود الطلاء واختبارات الرش، ثم نقيّم النتيجة في ضوء النهار قبل التشطيب.",
      ),
      f(
        "Do you service the DBX?",
        "هل تخدمون DBX؟",
        "Yes, DBX maintenance, diagnosis and repair are within our scope, subject to inspection.",
        "نعم، صيانة DBX وتشخيصها وإصلاحها ضمن نطاقنا بحسب الفحص.",
      ),
      f(
        "What happens after I submit the form?",
        "ماذا يحدث بعد إرسال النموذج؟",
        "Our team contacts you to understand the issue and arrange an inspection time. The enquiry is not an automatic booking.",
        "يتواصل فريقنا معك لفهم المشكلة وترتيب موعد للفحص. الاستفسار لا يعني حجزاً تلقائياً.",
      ),
    ],
    seo: ["Electrical, cooling and paint matching.", "الكهرباء والتبريد ومطابقة الطلاء."],
  },
  {
    slug: "ferrari",
    name: t("Ferrari", "فيراري"),
    kind: "manufacturer",
    parentName: null,
    collections: ["sports"],
    logoId: "logo-ferrari",
    models: [
      m("488 GTB / Spider", 2016, 2019),
      m("F8 Tributo", 2019),
      m("812 Superfast", 2017),
      m("Portofino / Roma", 2018),
      m("SF90", 2020),
      m("296", 2022),
      m("Purosangue", 2023),
    ],
    intro: t(
      "Ferrari ownership in Dubai means high temperatures, short trips and occasional track use. SHWURX diagnoses 2016+ Ferrari models in Al Quoz and agrees the repair plan with you before starting.",
      "امتلاك فيراري في دبي يعني حرارة مرتفعة ورحلات قصيرة واستخداماً للحلبة أحياناً. نشخّص في شوركس بالقوز موديلات فيراري 2016 وأحدث ونتفق معك على خطة الإصلاح قبل البدء.",
    ),
    knowledge: [
      k(
        "F1 dual-clutch gearbox",
        "ناقل الحركة مزدوج القابض",
        "Clutch wear, hydraulic pressure and adaptation values are checked before any gearbox repair is suggested.",
        "نفحص تآكل القابض والضغط الهيدروليكي وقيم التكيّف قبل اقتراح أي إصلاح لناقل الحركة.",
      ),
      k(
        "Short-trip use",
        "الاستخدام لمسافات قصيرة",
        "Cars that rarely warm up fully can develop battery, fluid and sensor issues. We review how the car is used as part of diagnosis.",
        "السيارات التي نادراً ما تصل إلى حرارة التشغيل الكاملة قد تعاني من مشكلات في البطارية والسوائل والحساسات. نراجع طريقة استخدام السيارة ضمن التشخيص.",
      ),
      k(
        "Hybrid models",
        "الموديلات الهجينة",
        "SF90 and 296 hybrid systems need an assessment of what can be safely handled locally. We are clear about the limits.",
        "تحتاج أنظمة SF90 و296 الهجينة إلى تقييم لما يمكن التعامل معه بأمان محلياً، ونحن واضحون بشأن الحدود.",
      ),
    ],
    serviceSlugs: WITH_PROG,
    faqs: [
      f(
        "Can you check clutch wear on my Ferrari?",
        "هل يمكنكم فحص تآكل القابض في سيارتي فيراري؟",
        "Yes, we read the clutch data and test the gearbox, then explain the remaining life and options.",
        "نعم، نقرأ بيانات القابض ونختبر ناقل الحركة، ثم نشرح العمر المتبقي والخيارات.",
      ),
      f(
        "Do you repair Ferrari paint chips?",
        "هل تصلحون خدوش طلاء فيراري؟",
        "We assess chips and scratches and quote partial or panel refinishing with colour matching.",
        "نقيّم الخدوش والتقشرات ونقدّم عرض سعر لإعادة طلاء جزئي أو لوح كامل مع مطابقة اللون.",
      ),
      f(
        "How do I share the problem?",
        "كيف أشارككم المشكلة؟",
        "Use the form on this page or WhatsApp with the model, year and symptom. Videos and photos help.",
        "استخدم النموذج في هذه الصفحة أو واتساب مع الموديل والسنة والعرض. الصور والفيديو مفيدة.",
      ),
    ],
    seo: ["Dual-clutch, short-trip and paint assessment.", "تقييم ناقل الحركة مزدوج القابض والاستخدام القصير والطلاء."],
  },
  {
    slug: "maserati",
    name: t("Maserati", "مازيراتي"),
    kind: "manufacturer",
    parentName: null,
    collections: [],
    logoId: "logo-maserati",
    models: [m("Ghibli"), m("Quattroporte"), m("Levante", 2017), m("MC20", 2021), m("Grecale", 2023)],
    intro: t(
      "Ghibli, Quattroporte and Levante owners often bring us electrical, suspension or cooling complaints. SHWURX diagnoses 2016+ Maserati models in Al Quoz and quotes clearly before repair.",
      "يأتينا مالكو جيبلي وكواتروبورتي وليفانتي غالباً بشكاوى في الكهرباء أو التعليق أو التبريد. نشخّص في شوركس بالقوز موديلات مازيراتي 2016 وأحدث ونقدّم عرض سعر واضحاً قبل الإصلاح.",
    ),
    knowledge: [
      k(
        "Levante air suspension",
        "التعليق الهوائي في ليفانتي",
        "Air springs, compressor and height sensors are tested together to find the actual cause of a lowering or warning.",
        "نختبر وسائد الهواء والضاغط وحساسات الارتفاع معاً لإيجاد السبب الحقيقي للانخفاض أو التحذير.",
      ),
      k(
        "Twin-turbo engines",
        "المحركات بتيربو مزدوج",
        "Boost leaks, coolant loss and oil condition are checked on V6 and V8 engines in hot weather.",
        "نفحص تسريب الضغط وفقدان سائل التبريد وحالة الزيت في محركات V6 وV8 في الطقس الحار.",
      ),
      k(
        "Battery and electrical",
        "البطارية والكهرباء",
        "Many warnings start with battery health. We test the charging system before diagnosing modules.",
        "كثير من التحذيرات تبدأ من صحة البطارية. نختبر نظام الشحن قبل تشخيص الوحدات.",
      ),
    ],
    serviceSlugs: WITH_PROG,
    faqs: [
      f(
        "My Levante keeps lowering overnight.",
        "سيارتي ليفانتي تنخفض أثناء الليل.",
        "That usually indicates a leak in the air system. We test each corner and line to locate it before quoting.",
        "يدل ذلك غالباً على تسريب في نظام الهواء. نختبر كل زاوية وخط لتحديده قبل تقديم عرض السعر.",
      ),
      f(
        "Do you maintain the MC20?",
        "هل تخدمون MC20؟",
        "Yes, maintenance and repair are within our scope, subject to inspection.",
        "نعم، الصيانة والإصلاح ضمن نطاقنا بحسب الفحص.",
      ),
      f(
        "Can you repair Maserati body damage?",
        "هل تصلحون أضرار هيكل مازيراتي؟",
        "Yes, panel repair and painting are part of our services. We assess and quote first.",
        "نعم، إصلاح الألواح والدهان من خدماتنا. نقيّم ونقدّم عرض السعر أولاً.",
      ),
    ],
    seo: ["Air suspension, twin-turbo and electrical diagnosis.", "تشخيص التعليق الهوائي والتيربو المزدوج والكهرباء."],
  },
  {
    slug: "bugatti",
    name: t("Bugatti", "بوغاتي"),
    kind: "manufacturer",
    parentName: null,
    collections: ["sports"],
    logoId: null,
    models: [m("Chiron", 2016)],
    intro: t(
      "A Bugatti is a very low-volume vehicle and many procedures depend on specialist access. For Chiron owners SHWURX offers inspection, assessment and clear advice on what can be handled independently in Al Quoz and what cannot.",
      "بوغاتي سيارة نادرة جداً، وكثير من إجراءاتها يعتمد على وصول تخصصي. نقدّم لمالكي شيرون في شوركس بالقوز فحصاً وتقييماً ونصيحة واضحة حول ما يمكن التعامل معه بشكل مستقل وما لا يمكن.",
    ),
    knowledge: [
      k(
        "Assessment first",
        "التقييم أولاً",
        "Before any work we confirm whether the job can be done safely and correctly outside the manufacturer network. If not, we tell you.",
        "قبل أي عمل نتأكد إن كان يمكن تنفيذه بأمان وبشكل صحيح خارج شبكة الشركة المصنعة، وإن لم يكن نخبرك بذلك.",
      ),
      k(
        "Cosmetic and body care",
        "العناية بالمظهر والهيكل",
        "Paint chips, minor panel damage and protection work can often be assessed and quoted independently.",
        "يمكن غالباً تقييم تقشر الطلاء والأضرار البسيطة في الألواح وأعمال الحماية وتقديم عرض سعر لها بشكل مستقل.",
      ),
      k(
        "Storage and readiness",
        "التخزين والجاهزية",
        "Cars that are stored for long periods need battery, tyre and fluid checks before use.",
        "تحتاج السيارات المخزنة لفترات طويلة إلى فحص البطارية والإطارات والسوائل قبل الاستخدام.",
      ),
    ],
    serviceSlugs: ["diagnostics", "bodywork", "painting"],
    faqs: [
      f(
        "Can you service a Bugatti Chiron?",
        "هل يمكنكم صيانة بوغاتي شيرون؟",
        "We assess each request individually and will be honest about which procedures are within our capability.",
        "نقيّم كل طلب على حدة وسنكون صريحين بشأن الإجراءات التي تقع ضمن قدرتنا.",
      ),
      f(
        "Do you handle paint correction?",
        "هل تقدمون تصحيح الطلاء؟",
        "Paint assessment and refinishing can be quoted after inspection.",
        "يمكن تقديم عرض سعر لتقييم الطلاء وإعادة تشطيبه بعد الفحص.",
      ),
      f(
        "How do I start?",
        "كيف أبدأ؟",
        "Contact us by WhatsApp or the form with what you need. We reply to discuss it before any visit.",
        "تواصل معنا عبر واتساب أو النموذج بما تحتاجه، وسنرد لمناقشته قبل أي زيارة.",
      ),
    ],
    seo: ["Honest assessment, cosmetic and body care.", "تقييم صريح وعناية بالمظهر والهيكل."],
  },
  {
    slug: "chevrolet-corvette",
    name: t("Chevrolet Corvette", "شيفروليه كورفيت"),
    kind: "model_family",
    parentName: t("Chevrolet", "شيفروليه"),
    collections: ["sports"],
    logoId: null,
    models: [m("Corvette C7", 2016, 2019), m("Corvette C8", 2020)],
    intro: t(
      "The Corvette changed completely between the front-engine C7 and the mid-engine C8. SHWURX works on both generations from 2016 onwards in Al Quoz, with diagnosis and a clear quote before repair.",
      "تغيّرت كورفيت بالكامل بين الجيل C7 ذي المحرك الأمامي والجيل C8 ذي المحرك الوسطي. نعمل في شوركس بالقوز على الجيلين من 2016 فما فوق، مع تشخيص وعرض سعر واضح قبل الإصلاح.",
    ),
    knowledge: [
      k(
        "C8 dual-clutch gearbox",
        "ناقل الحركة مزدوج القابض في C8",
        "The C8 uses an 8-speed dual-clutch gearbox. Shift complaints are checked with fluid inspection and live data.",
        "يستخدم C8 ناقل حركة مزدوج القابض بثماني سرعات. نفحص شكاوى التبديل بفحص الزيت والبيانات الحية.",
      ),
      k(
        "Magnetic Ride Control",
        "نظام Magnetic Ride Control",
        "Adaptive dampers are tested for leaks and correct response, which affects ride and handling.",
        "نختبر الممتصات التكيفية للكشف عن التسريب والتأكد من استجابتها، وهذا يؤثر على الراحة والثبات.",
      ),
      k(
        "Cooling and V8 care",
        "التبريد والعناية بمحرك V8",
        "LT-series V8 engines run hot in Dubai summers. Coolant, oil and fan operation are inspected routinely.",
        "تعمل محركات V8 من سلسلة LT بحرارة عالية في صيف دبي، ونفحص سائل التبريد والزيت وعمل المراوح بشكل دوري.",
      ),
    ],
    serviceSlugs: WITH_PROG,
    faqs: [
      f(
        "Do you work on the C8 Corvette?",
        "هل تعملون على كورفيت C8؟",
        "Yes, C8 maintenance, diagnosis and repair are within our scope, subject to inspection.",
        "نعم، صيانة C8 وتشخيصه وإصلاحه ضمن نطاقنا بحسب الفحص.",
      ),
      f(
        "Can you lift the front of a low C8?",
        "هل يمكنكم رفع مقدمة C8 المنخفضة؟",
        "We handle low-clearance cars carefully and check the front lift system if fitted.",
        "نتعامل مع السيارات ذات الخلوص المنخفض بعناية ونفحص نظام رفع المقدمة إن وُجد.",
      ),
      f(
        "Is Corvette a separate brand?",
        "هل كورفيت علامة مستقلة؟",
        "Corvette is a Chevrolet model family. We list it separately because owners search for it by name.",
        "كورفيت فئة طرازات من شيفروليه، ونعرضها بشكل منفصل لأن المالكين يبحثون عنها بالاسم.",
      ),
    ],
    seo: ["C7 and C8 gearbox, damper and cooling diagnosis.", "تشخيص ناقل الحركة والممتصات والتبريد في C7 وC8."],
  },
  {
    slug: "gmc",
    name: t("GMC", "جي إم سي"),
    kind: "manufacturer",
    parentName: null,
    collections: [],
    logoId: null,
    models: [m("Yukon / Yukon Denali"), m("Sierra"), m("Acadia")],
    intro: t(
      "GMC Yukon and Sierra trucks in Dubai do heavy work: family trips, desert driving and towing. SHWURX maintains and repairs 2016+ GMC models in Al Quoz with a clear inspection and quotation.",
      "تقوم شاحنات جي إم سي يوكن وسييرا في دبي بأعمال شاقة: رحلات عائلية وقيادة صحراوية وسحب. نصون ونصلح في شوركس بالقوز موديلات جي إم سي 2016 وأحدث مع فحص وعرض سعر واضحين.",
    ),
    knowledge: [
      k(
        "Transmission and towing",
        "ناقل الحركة والسحب",
        "Towing and desert use put heat into the transmission. We check fluid condition and shift behaviour.",
        "يرفع السحب والقيادة في الصحراء حرارة ناقل الحركة. نفحص حالة الزيت وسلوك التبديل.",
      ),
      k(
        "AC performance",
        "أداء التكييف",
        "Large cabins demand strong AC. We test pressures, condenser condition and leaks.",
        "تحتاج المقصورات الكبيرة إلى تكييف قوي. نختبر الضغوط وحالة المكثف والتسريبات.",
      ),
      k(
        "Suspension and steering",
        "التعليق والتوجيه",
        "Heavy vehicles wear bushes, ball joints and dampers. We inspect and explain what needs attention now and what can wait.",
        "تستهلك المركبات الثقيلة الجلب والمفاصل والممتصات. نفحص ونوضح ما يحتاج إلى اهتمام الآن وما يمكن تأجيله.",
      ),
    ],
    serviceSlugs: WITH_PROG,
    faqs: [
      f(
        "My Yukon AC is weak in summer.",
        "تكييف سيارتي يوكن ضعيف في الصيف.",
        "We check refrigerant pressures, condenser airflow and leaks, then quote the repair.",
        "نفحص ضغط غاز التبريد وتدفق الهواء في المكثف والتسريبات، ثم نقدّم عرض سعر للإصلاح.",
      ),
      f(
        "Do you service the Sierra?",
        "هل تخدمون سييرا؟",
        "Yes, maintenance and repair of the Sierra are within our scope.",
        "نعم، صيانة وإصلاح سييرا ضمن نطاقنا.",
      ),
      f(
        "Can you check my truck after desert driving?",
        "هل يمكنكم فحص سيارتي بعد القيادة في الصحراء؟",
        "Yes, we inspect underbody, suspension, filters and cooling after off-road use.",
        "نعم، نفحص أسفل السيارة والتعليق والفلاتر والتبريد بعد القيادة خارج الطرق.",
      ),
    ],
    seo: ["Transmission, AC and suspension care.", "العناية بناقل الحركة والتكييف والتعليق."],
  },
  {
    slug: "range-rover",
    name: t("Range Rover", "رينج روفر"),
    kind: "model_family",
    parentName: t("Land Rover", "لاند روفر"),
    collections: [],
    logoId: "logo-landrover",
    models: [m("Range Rover"), m("Range Rover Sport"), m("Range Rover Velar", 2017), m("Range Rover Evoque")],
    intro: t(
      "Range Rover models from Land Rover combine air suspension, terrain systems and many electronic modules. SHWURX diagnoses 2016+ Range Rover, Sport, Velar and Evoque in Al Quoz and quotes before repair.",
      "تجمع موديلات رينج روفر من لاند روفر بين التعليق الهوائي وأنظمة التضاريس ووحدات إلكترونية كثيرة. نشخّص في شوركس بالقوز رينج روفر وسبورت وفيلار وإيفوك موديلات 2016 وأحدث ونقدّم عرض السعر قبل الإصلاح.",
    ),
    knowledge: [
      k(
        "Air suspension",
        "التعليق الهوائي",
        "Suspension faults are among the most common Range Rover complaints. We test springs, lines, valve block and compressor together.",
        "أعطال التعليق من أكثر شكاوى رينج روفر شيوعاً. نختبر الوسائد والخطوط وكتلة الصمامات والضاغط معاً.",
      ),
      k(
        "Cooling and oil leaks",
        "التبريد وتسريب الزيت",
        "Coolant pipes and oil seals are inspected, especially on high-mileage cars used in summer traffic.",
        "نفحص أنابيب التبريد وموانع تسريب الزيت، خصوصاً في السيارات ذات المسافات العالية المستخدمة في زحام الصيف.",
      ),
      k(
        "Electronics and modules",
        "الإلكترونيات والوحدات",
        "Warnings across several systems often trace to battery health or a single module. We diagnose methodically.",
        "التحذيرات في عدة أنظمة تعود غالباً إلى صحة البطارية أو وحدة واحدة، ونشخّص بطريقة منهجية.",
      ),
    ],
    serviceSlugs: WITH_PROG,
    faqs: [
      f(
        "My Range Rover shows a suspension fault.",
        "تظهر في سيارتي رينج روفر رسالة عطل في التعليق.",
        "We read fault codes, test each corner and the compressor, and explain the cause before quoting.",
        "نقرأ رموز الأعطال ونختبر كل زاوية والضاغط، ونشرح السبب قبل تقديم عرض السعر.",
      ),
      f(
        "Do you also work on other Land Rover models?",
        "هل تعملون على موديلات لاند روفر الأخرى؟",
        "This page focuses on Range Rover. Contact us about other Land Rover models and we will advise.",
        "تركز هذه الصفحة على رينج روفر. تواصل معنا بخصوص موديلات لاند روفر الأخرى وسننصحك.",
      ),
      f(
        "Can you repair Range Rover bodywork?",
        "هل تصلحون هيكل رينج روفر؟",
        "Yes, including aluminium panels where repair is appropriate. We assess first.",
        "نعم، بما في ذلك ألواح الألمنيوم عندما يكون الإصلاح مناسباً، ونقيّم أولاً.",
      ),
    ],
    seo: ["Air suspension, cooling and module diagnosis.", "تشخيص التعليق الهوائي والتبريد والوحدات."],
  },
]

export function seedBrands(): Brand[] {
  return SEEDS.map(({ seo: s, ...b }) => ({
    ...b,
    id: `brand-${b.slug}`,
    heroImageId: brandHeroId(b.slug),
    yearFrom: 2016,
    galleryIds: [],
    caseStudies: [],
    visible: true,
    seo: seo(b.name.en, b.name.ar, s[0], s[1]),
  }))
}
