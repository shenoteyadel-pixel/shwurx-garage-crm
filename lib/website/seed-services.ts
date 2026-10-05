import type { Faq, Service, ServiceKind, TextItem } from "./types"
import { t } from "./seed-brands"

let seq = 0
const uid = (p: string) => `${p}-s${(++seq).toString(36)}`
const item = (enT: string, arT: string, enB: string, arB: string): TextItem => ({
  id: uid("i"),
  title: t(enT, arT),
  body: t(enB, arB),
})
const faq = (qEn: string, qAr: string, aEn: string, aAr: string): Faq => ({ id: uid("faq"), q: t(qEn, qAr), a: t(aEn, aAr) })

const STEPS = {
  inspect: item(
    "Inspection",
    "الفحص",
    "We confirm the complaint with you and inspect the vehicle.",
    "نتأكد من الشكوى معك ونفحص السيارة.",
  ),
  quote: item(
    "Quotation",
    "عرض السعر",
    "You receive a written quotation listing each item separately.",
    "تستلم عرض سعر مكتوباً يذكر كل بند على حدة.",
  ),
  approve: item(
    "Your approval",
    "موافقتك",
    "We only carry out the items you approve. Anything new found during the job is quoted first.",
    "لا ننفذ إلا البنود التي توافق عليها، وأي شيء جديد نكتشفه أثناء العمل نقدّم له عرض سعر أولاً.",
  ),
  handover: item(
    "Handover",
    "التسليم",
    "We explain what was done and hand back the vehicle with the job record.",
    "نشرح ما تم تنفيذه ونسلّم السيارة مع سجل العمل.",
  ),
}

const seoFor = (enName: string, arName: string, enD: string, arD: string) => ({
  title: t(`${enName} in Al Quoz, Dubai`, `${arName} في القوز، دبي`),
  description: t(enD, arD),
  ogImageId: null,
  noindex: false,
})

type S = Omit<Service, "id" | "visible" | "galleryIds" | "steps"> & { steps?: TextItem[] }

const SEEDS: S[] = [
  {
    slug: "mechanical-repair",
    kind: "mechanical" satisfies ServiceKind,
    name: t("Mechanical repair & maintenance", "الإصلاح والصيانة الميكانيكية"),
    summary: t(
      "Engine, gearbox, suspension, brakes, cooling and AC for premium vehicles.",
      "المحرك وناقل الحركة والتعليق والمكابح والتبريد والتكييف للسيارات الفاخرة.",
    ),
    intro: t(
      "Mechanical problems in Dubai are often heat-related: cooling, AC, rubber components and fluids all work harder here. At SHWURX in Al Quoz we inspect the vehicle, find the actual cause and quote each item before repairing.",
      "كثير من المشكلات الميكانيكية في دبي مرتبط بالحرارة: التبريد والتكييف والقطع المطاطية والسوائل تعمل بجهد أكبر هنا. في شوركس بالقوز نفحص السيارة ونحدد السبب الحقيقي ونقدّم عرض سعر لكل بند قبل الإصلاح.",
    ),
    subservices: [
      item("Scheduled maintenance", "الصيانة الدورية", "Oil, filters, fluids and inspection items based on your service indicator and mileage.", "الزيت والفلاتر والسوائل وبنود الفحص بحسب مؤشر الصيانة والمسافة المقطوعة."),
      item("Engine and cooling", "المحرك والتبريد", "Leaks, overheating, misfires and noises, diagnosed before parts are replaced.", "التسريبات وارتفاع الحرارة واختلال الاحتراق والأصوات، مع التشخيص قبل تبديل القطع."),
      item("Gearbox and drivetrain", "ناقل الحركة ونظام الدفع", "Shift problems, fluid service and drivetrain noises.", "مشكلات التبديل وتغيير الزيت وأصوات نظام الدفع."),
      item("Suspension and steering", "التعليق والتوجيه", "Air and conventional suspension, dampers, bushes and alignment checks.", "التعليق الهوائي والتقليدي والممتصات والجلب وفحص الضبط."),
      item("Brakes", "المكابح", "Pads, discs, fluid and brake system faults.", "الفحمات والأقراص والزيت وأعطال نظام المكابح."),
      item("Air conditioning", "التكييف", "Pressure testing, leak finding and AC component repair.", "اختبار الضغط وكشف التسريب وإصلاح مكونات التكييف."),
    ],
    preparation: t(
      "Tell us the model, year, mileage and what you notice. If there is a noise, a short video helps us prepare.",
      "أخبرنا بالموديل والسنة والمسافة المقطوعة وما تلاحظه. إن كان هناك صوت، فمقطع فيديو قصير يساعدنا على التحضير.",
    ),
    faqs: [
      faq("Do you use genuine parts?", "هل تستخدمون قطعاً أصلية؟", "We explain the part options available for your repair in the quotation, and the choice is yours.", "نوضح خيارات القطع المتاحة لإصلاحك في عرض السعر، والاختيار لك."),
      faq("Can I wait while the car is serviced?", "هل يمكنني الانتظار أثناء الصيانة؟", "For short jobs, yes. Ask us when booking and we will tell you the expected time.", "في الأعمال القصيرة نعم. اسألنا عند الحجز وسنخبرك بالوقت المتوقع."),
      faq("What if you find more problems?", "ماذا لو وجدتم مشكلات إضافية؟", "We contact you with photos and a quotation. Nothing extra is done without your approval.", "نتواصل معك بالصور وعرض السعر، ولا يتم تنفيذ أي شيء إضافي دون موافقتك."),
    ],
    scopeNote: t(
      "Repair scope is confirmed after inspection. Some jobs may need manufacturer-only procedures; we tell you when that applies.",
      "يتم تأكيد نطاق الإصلاح بعد الفحص. بعض الأعمال قد تتطلب إجراءات خاصة بالشركة المصنعة، ونخبرك عندما ينطبق ذلك.",
    ),
    seo: seoFor(
      "Mechanical Repair & Maintenance",
      "الإصلاح والصيانة الميكانيكية",
      "Engine, gearbox, suspension, brakes and AC repair for premium cars at SHWURX, Al Quoz Industrial Area 2. Inspection and written quote first.",
      "إصلاح المحرك وناقل الحركة والتعليق والمكابح والتكييف للسيارات الفاخرة لدى شوركس، القوز الصناعية 2. الفحص وعرض السعر المكتوب أولاً.",
    ),
  },
  {
    slug: "diagnostics",
    kind: "diagnostics",
    name: t("Diagnostics", "التشخيص"),
    summary: t("Warning lights, faults and intermittent problems traced to the cause.", "لمبات التحذير والأعطال والمشكلات المتقطعة حتى الوصول إلى السبب."),
    intro: t(
      "A fault code tells you where to look, not always what is wrong. SHWURX combines scan data, live readings and physical tests to find the cause, so you pay for the right repair.",
      "رمز العطل يخبرك أين تبحث، وليس دائماً ما هو العطل. نجمع في شوركس بين بيانات الفحص والقراءات الحية والاختبارات الفعلية للوصول إلى السبب، حتى تدفع مقابل الإصلاح الصحيح.",
    ),
    subservices: [
      item("Warning lights", "لمبات التحذير", "Engine, gearbox, suspension, ABS and airbag warnings.", "تحذيرات المحرك وناقل الحركة والتعليق وABS والوسائد الهوائية."),
      item("Electrical faults", "الأعطال الكهربائية", "Battery drain, charging, module communication and wiring faults.", "تفريغ البطارية والشحن واتصال الوحدات وأعطال الأسلاك."),
      item("Intermittent problems", "المشكلات المتقطعة", "Faults that come and go, investigated with road tests and data logging.", "الأعطال التي تظهر وتختفي، مع تحقيقها بتجارب القيادة وتسجيل البيانات."),
      item("Pre-purchase inspection", "فحص ما قبل الشراء", "Condition check of a used premium vehicle before you buy.", "فحص حالة سيارة فاخرة مستعملة قبل شرائها."),
    ],
    preparation: t(
      "Note when the problem happens (cold start, in traffic, at speed) and send a photo of any warning message.",
      "دوّن متى تظهر المشكلة (عند التشغيل البارد أو في الزحام أو على السرعة) وأرسل صورة لأي رسالة تحذير.",
    ),
    faqs: [
      faq("Is diagnosis charged separately?", "هل التشخيص مدفوع بشكل منفصل؟", "Diagnosis time depends on the fault. We confirm the diagnostic approach and any charge with you before starting.", "يعتمد وقت التشخيص على العطل. نؤكد معك طريقة التشخيص وأي رسوم قبل البدء."),
      faq("Can you clear the warning light?", "هل يمكنكم مسح لمبة التحذير؟", "We can clear codes, but we recommend finding the cause first so it does not return.", "يمكننا مسح الرموز، لكننا ننصح بإيجاد السبب أولاً حتى لا يعود التحذير."),
      faq("Do you do pre-purchase checks?", "هل تقدمون فحص ما قبل الشراء؟", "Yes. Contact us with the vehicle details and the seller's location.", "نعم. تواصل معنا بتفاصيل السيارة وموقع البائع."),
    ],
    scopeNote: t(
      "Diagnostic depth varies by brand, model and system. We tell you what we can access for your vehicle.",
      "يختلف عمق التشخيص بحسب العلامة والموديل والنظام. نخبرك بما يمكننا الوصول إليه في سيارتك.",
    ),
    seo: seoFor(
      "Car Diagnostics",
      "تشخيص السيارات",
      "Warning light, electrical and intermittent fault diagnosis for premium cars at SHWURX, Al Quoz Industrial Area 2, Dubai.",
      "تشخيص لمبات التحذير والأعطال الكهربائية والمتقطعة للسيارات الفاخرة لدى شوركس، القوز الصناعية 2، دبي.",
    ),
  },
  {
    slug: "bodywork",
    kind: "bodywork",
    name: t("Bodywork & panel repair", "إصلاح الهيكل والألواح"),
    summary: t("Dents, collision damage and panel repair or replacement.", "الانبعاجات وأضرار الحوادث وإصلاح الألواح أو استبدالها."),
    intro: t(
      "Premium cars use aluminium, steel and composite panels, each repaired differently. SHWURX assesses the damage and material, then quotes repair or replacement options with a clear scope.",
      "تستخدم السيارات الفاخرة ألواحاً من الألمنيوم والفولاذ والمواد المركّبة، ولكل منها طريقة إصلاح مختلفة. نقيّم في شوركس الضرر ونوع المادة، ثم نقدّم خيارات الإصلاح أو الاستبدال بنطاق واضح.",
    ),
    subservices: [
      item("Dent and panel repair", "إصلاح الانبعاجات والألواح", "Repairing damaged panels where repair is the right option.", "إصلاح الألواح المتضررة عندما يكون الإصلاح هو الخيار المناسب."),
      item("Collision repair", "إصلاح أضرار الحوادث", "Assessment and repair of accident damage, including fitment and gaps.", "تقييم وإصلاح أضرار الحوادث، بما في ذلك التركيب والفواصل."),
      item("Bumpers and trim", "الصدامات والكسوات", "Bumper repair, clips, trim and sensor brackets.", "إصلاح الصدامات والمشابك والكسوات وحوامل الحساسات."),
    ],
    preparation: t(
      "Send clear photos of the damage from several angles, and tell us if an insurance claim is involved.",
      "أرسل صوراً واضحة للضرر من عدة زوايا، وأخبرنا إن كانت هناك مطالبة تأمين.",
    ),
    faqs: [
      faq("Can you quote from photos?", "هل يمكنكم تقديم عرض سعر من الصور؟", "Photos give us an initial idea. The final quote follows an inspection because hidden damage is common.", "تعطينا الصور فكرة مبدئية، أما عرض السعر النهائي فيكون بعد الفحص لأن الأضرار المخفية شائعة."),
      faq("Do you work with insurance?", "هل تتعاملون مع التأمين؟", "Tell us your insurer and we will explain what is needed for your case.", "أخبرنا بشركة التأمين وسنوضح ما يلزم لحالتك."),
      faq("Will sensors need calibration?", "هل تحتاج الحساسات إلى معايرة؟", "After bumper or windscreen work, parking sensors and cameras may need checks or calibration. We tell you when this applies.", "بعد أعمال الصدام أو الزجاج قد تحتاج حساسات الركن والكاميرات إلى فحص أو معايرة، ونخبرك عندما ينطبق ذلك."),
    ],
    scopeNote: t("Structural damage is assessed case by case.", "يتم تقييم الأضرار الهيكلية حالة بحالة."),
    seo: seoFor(
      "Bodywork & Panel Repair",
      "إصلاح الهيكل والألواح",
      "Dent, collision and panel repair for premium cars at SHWURX, Al Quoz Industrial Area 2, Dubai. Assessment and written quote first.",
      "إصلاح الانبعاجات والحوادث والألواح للسيارات الفاخرة لدى شوركس، القوز الصناعية 2، دبي. التقييم وعرض السعر المكتوب أولاً.",
    ),
  },
  {
    slug: "painting",
    kind: "painting",
    name: t("Painting & refinishing", "الدهان وإعادة التشطيب"),
    summary: t("Colour-matched paint repair, scratches, chips and full panels.", "إصلاح الطلاء بمطابقة اللون والخدوش والتقشر والألواح الكاملة."),
    intro: t(
      "Good paintwork is invisible. SHWURX matches to your paint code, checks spray-out tests and blends where needed, so the repair sits with the rest of the car.",
      "الطلاء الجيد لا يُلاحظ. نطابق في شوركس كود الطلاء ونتحقق من اختبارات الرش ونمزج عند الحاجة، حتى يتناسق الإصلاح مع باقي السيارة.",
    ),
    subservices: [
      item("Scratch and chip repair", "إصلاح الخدوش والتقشر", "Localised repair of chips and scratches.", "إصلاح موضعي للتقشر والخدوش."),
      item("Panel refinishing", "إعادة طلاء الألواح", "Full panel paint after body repair or damage.", "طلاء لوح كامل بعد إصلاح الهيكل أو الضرر."),
      item("Wheel refinishing", "إعادة تشطيب الجنوط", "Kerb damage repair, assessed per wheel.", "إصلاح أضرار الأرصفة بتقييم كل جنط على حدة."),
    ],
    preparation: t(
      "Share photos in daylight and the paint code if you know it (usually on a door-jamb label).",
      "شارك صوراً في ضوء النهار وكود الطلاء إن كنت تعرفه (غالباً على ملصق إطار الباب).",
    ),
    faqs: [
      faq("Can you match special colours?", "هل يمكنكم مطابقة الألوان الخاصة؟", "We match to the paint code and test before applying. Some special finishes need extra steps, which we explain in the quote.", "نطابق حسب كود الطلاء ونختبر قبل التطبيق. بعض التشطيبات الخاصة تحتاج إلى خطوات إضافية نشرحها في عرض السعر."),
      faq("How long does paint take?", "كم يستغرق الطلاء؟", "It depends on the size of the repair and curing time. We give you an estimate with the quotation.", "يعتمد ذلك على حجم الإصلاح ووقت الجفاف، ونعطيك تقديراً مع عرض السعر."),
      faq("Do you offer protection film?", "هل تقدمون أفلام الحماية؟", "Ask us about your requirement and we will advise what we can provide.", "اسألنا عن احتياجك وسننصحك بما يمكننا تقديمه."),
    ],
    scopeNote: t("Finish results depend on the existing paint condition, which we assess first.", "تعتمد نتيجة التشطيب على حالة الطلاء الحالي، والتي نقيّمها أولاً."),
    seo: seoFor(
      "Car Painting & Refinishing",
      "دهان السيارات وإعادة التشطيب",
      "Colour-matched paint repair for premium cars at SHWURX, Al Quoz Industrial Area 2, Dubai.",
      "إصلاح الطلاء بمطابقة اللون للسيارات الفاخرة لدى شوركس، القوز الصناعية 2، دبي.",
    ),
  },
  {
    slug: "online-programming",
    kind: "programming_online",
    name: t("Online programming", "البرمجة عبر الإنترنت"),
    summary: t(
      "Software updates and coding that require a connection, assessed per vehicle.",
      "تحديثات البرمجيات والترميز التي تتطلب اتصالاً بالإنترنت، مع التقييم لكل سيارة.",
    ),
    intro: t(
      "Some control-unit updates and component registrations require an online session. Whether this is available depends on the brand, model and system, so SHWURX confirms what is possible for your car before any work.",
      "تتطلب بعض تحديثات وحدات التحكم وتسجيل القطع جلسة عبر الإنترنت. يعتمد توفر ذلك على العلامة والموديل والنظام، لذلك نؤكد في شوركس ما هو ممكن لسيارتك قبل أي عمل.",
    ),
    subservices: [
      item("Software updates", "تحديثات البرمجيات", "Updating control units where an update is available and appropriate.", "تحديث وحدات التحكم عندما يكون التحديث متاحاً ومناسباً."),
      item("Component registration", "تسجيل القطع", "Registering replaced parts that the vehicle needs to recognise.", "تسجيل القطع المستبدلة التي تحتاج السيارة إلى التعرف عليها."),
    ],
    preparation: t(
      "Share the VIN, model and year, and what was replaced or what message appears.",
      "شارك رقم الهيكل والموديل والسنة وما تم استبداله أو الرسالة التي تظهر.",
    ),
    faqs: [
      faq("Can you program any module?", "هل يمكنكم برمجة أي وحدة؟", "No. Capability depends on the vehicle and system. We check before agreeing to the work.", "لا. تعتمد الإمكانية على السيارة والنظام، ونتحقق قبل الموافقة على العمل."),
      faq("Is this the same as tuning?", "هل هذا مثل تعديل الأداء؟", "No. This service covers manufacturer-intended updates, coding and registration.", "لا. تشمل هذه الخدمة التحديثات والترميز والتسجيل وفق ما تقصده الشركة المصنعة."),
      faq("What information do you need?", "ما المعلومات التي تحتاجونها؟", "The VIN and a description of the task help us confirm whether we can do it.", "رقم الهيكل ووصف المهمة يساعداننا على تأكيد إمكانية تنفيذها."),
    ],
    scopeNote: t(
      "Online programming is subject to brand, model, system and access. We will tell you clearly if we cannot do it.",
      "تخضع البرمجة عبر الإنترنت للعلامة والموديل والنظام وإمكانية الوصول، وسنخبرك بوضوح إن لم نتمكن من تنفيذها.",
    ),
    seo: seoFor(
      "Online Car Programming & Coding",
      "برمجة وترميز السيارات عبر الإنترنت",
      "Control-unit updates and component registration for premium cars, assessed per vehicle, at SHWURX in Al Quoz, Dubai.",
      "تحديث وحدات التحكم وتسجيل القطع للسيارات الفاخرة مع التقييم لكل سيارة لدى شوركس في القوز، دبي.",
    ),
  },
  {
    slug: "offline-programming",
    kind: "programming_offline",
    name: t("Offline programming & coding", "البرمجة والترميز دون اتصال"),
    summary: t(
      "Coding, adaptations and configuration that do not need an online session.",
      "الترميز والتكيّفات والإعدادات التي لا تحتاج إلى جلسة عبر الإنترنت.",
    ),
    intro: t(
      "Many tasks after a repair, such as adaptations, resets and coding, can be done offline. SHWURX checks what your vehicle needs and confirms we can carry it out before starting.",
      "كثير من المهام بعد الإصلاح، مثل التكيّفات وإعادة الضبط والترميز، يمكن تنفيذها دون اتصال. نتحقق في شوركس مما تحتاجه سيارتك ونؤكد قدرتنا على تنفيذه قبل البدء.",
    ),
    subservices: [
      item("Adaptations and resets", "التكيّفات وإعادة الضبط", "Throttle, gearbox, steering angle and service resets after repair.", "ضبط الخانق وناقل الحركة وزاوية التوجيه وإعادة ضبط الصيانة بعد الإصلاح."),
      item("Battery registration", "تسجيل البطارية", "Registering a new battery where the vehicle requires it.", "تسجيل البطارية الجديدة عندما تتطلب السيارة ذلك."),
      item("Configuration coding", "ترميز الإعدادات", "Enabling or adjusting supported settings within the vehicle's design.", "تفعيل أو تعديل الإعدادات المدعومة ضمن تصميم السيارة."),
    ],
    preparation: t("Tell us the model, year and the task you need.", "أخبرنا بالموديل والسنة والمهمة التي تحتاجها."),
    faqs: [
      faq("Can you code features into my car?", "هل يمكنكم تفعيل خصائص في سيارتي؟", "Only features the vehicle's hardware supports, and only after we confirm it for your model.", "فقط الخصائص التي تدعمها مكونات السيارة، وبعد تأكيدنا لذلك في موديلك."),
      faq("Does a new battery need coding?", "هل تحتاج البطارية الجديدة إلى ترميز؟", "Many premium vehicles require battery registration. We check this during replacement.", "تتطلب كثير من السيارات الفاخرة تسجيل البطارية، ونتحقق من ذلك أثناء الاستبدال."),
      faq("Is coding safe?", "هل الترميز آمن؟", "We only carry out changes we can verify for your vehicle, and we record what was changed.", "لا ننفذ إلا التعديلات التي نستطيع التحقق منها لسيارتك، ونسجّل ما تم تغييره."),
    ],
    scopeNote: t(
      "Offline coding is subject to brand, model and system support.",
      "يخضع الترميز دون اتصال لدعم العلامة والموديل والنظام.",
    ),
    seo: seoFor(
      "Car Coding & Adaptations",
      "ترميز السيارات والتكيّفات",
      "Adaptations, battery registration and coding for premium cars, subject to vehicle support, at SHWURX in Al Quoz, Dubai.",
      "التكيّفات وتسجيل البطارية والترميز للسيارات الفاخرة بحسب دعم السيارة لدى شوركس في القوز، دبي.",
    ),
  },
]

export function seedServices(): Service[] {
  return SEEDS.map((s) => ({
    ...s,
    id: `service-${s.slug}`,
    visible: true,
    galleryIds: [],
    steps: s.steps ?? [STEPS.inspect, STEPS.quote, STEPS.approve, STEPS.handover],
  }))
}
