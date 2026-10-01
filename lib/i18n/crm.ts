import type { Locale } from "./config"

export const GUIDE_VERSION = 1

export type AlertKind =
  | "late_no_checkin"
  | "late_checked_in"
  | "forgot_checkout"
  | "jobs_overdue"
  | "approvals_pending"
  | "parts_pending"

export type GuideTopic =
  | "welcome"
  | "attendance"
  | "my_jobs"
  | "inspection"
  | "photos"
  | "parts_request"
  | "create_job"
  | "approvals"
  | "parts_desk"
  | "flow"
  | "reports"
  | "users"
  | "alerts"

type Text = { title: string; body: string }

export interface CrmDict {
  nav: Record<string, string>
  groups: Record<string, string>
  header: {
    newJob: string
    controlCenter: string
    help: string
    alerts: string
    openMenu: string
    closeMenu: string
    signOut: string
    workshopCrm: string
  }
  guide: {
    heading: string
    stepOf: string
    back: string
    next: string
    finish: string
    skip: string
    topics: Record<GuideTopic, Text & { tips: string[] }>
  }
  alerts: {
    heading: string
    subheading: string
    none: string
    dismiss: string
    open: string
    severity: { critical: string; warning: string; info: string }
    kinds: Record<AlertKind, Text>
  }
}

const en: CrmDict = {
  nav: {
    "/crm": "Dashboard",
    "/attendance": "Check In / Out",
    "/control-center": "AI Control Center",
    "/finance": "Finance & Audit",
    "/reports/vat": "VAT Return",
    "/flow": "Car Flow",
    "/jobs": "Job Cards",
    "/appointments": "Appointments",
    "/history": "History",
    "/leads": "Leads",
    "/customers": "Customers",
    "/invoices": "Invoices",
    "/marketing": "Website Control Center",
    "/parts": "Parts",
    "/purchasing": "Purchasing",
    "/purchasing/invoices": "Scan Invoice",
    "/inventory": "Store / Inventory",
    "/suppliers": "Suppliers",
    "/reports": "Reports",
    "/reports/labour": "Labour Report",
    "/users": "Users & Roles",
    "/settings": "Settings",
    "/recycle-bin": "Recycle Bin",
  },
  groups: {
    Finance: "Finance",
    Workshop: "Workshop",
    "Sales & Customers": "Sales & Customers",
    "Parts & Purchasing": "Parts & Purchasing",
    Insights: "Insights",
    Admin: "Admin",
  },
  header: {
    newJob: "New Job Card",
    controlCenter: "AI Control Center",
    help: "Guide",
    alerts: "Alerts",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    signOut: "Sign out",
    workshopCrm: "Workshop CRM",
  },
  guide: {
    heading: "Account guide",
    stepOf: "Step {n} of {total}",
    back: "Back",
    next: "Next",
    finish: "Got it",
    skip: "Skip guide",
    topics: {
      welcome: {
        title: "Welcome, {name}",
        body: "This short guide shows how to use your account as {role}. You only see the screens your role allows.",
        tips: [
          "Use the menu on the side to move between areas.",
          "Switch between English and Arabic with the EN / عربي button at the top.",
          "Reopen this guide any time from the Guide button.",
        ],
      },
      attendance: {
        title: "Check in and out every day",
        body: "Open Check In / Out at the start and end of your shift. Your location is verified inside the workshop.",
        tips: [
          "Allow location access when your phone asks.",
          "Check in before your shift time plus the grace period, or it is recorded as late.",
          "Late arrivals and absences can be deducted from salary.",
        ],
      },
      my_jobs: {
        title: "Your job cards",
        body: "Job Cards lists every vehicle assigned to you. Open a card to see the customer request and vehicle details.",
        tips: [
          "Read the customer complaint before starting work.",
          "Move the job to the next stage when your step is complete.",
        ],
      },
      inspection: {
        title: "Inspection and diagnosis",
        body: "Fill in the inspection checklist and record your diagnosis on the job card.",
        tips: [
          "Mark each item as OK, attention or urgent.",
          "Write a clear diagnosis so the advisor can quote it.",
        ],
      },
      photos: {
        title: "Upload problem and part photos",
        body: "Use the Photos panel to attach evidence from your phone camera.",
        tips: [
          "Choose the Problem category for faults and damage.",
          "Choose Parts for old and new parts.",
          "Photos help the customer approve repairs faster.",
        ],
      },
      parts_request: {
        title: "Request parts",
        body: "Request the parts you need for diagnosis or repair directly from the job card.",
        tips: [
          "Pick from the catalog suggestions to avoid spelling mistakes.",
          "The parts desk will update the status when the part is ordered or received.",
        ],
      },
      create_job: {
        title: "Create job cards",
        body: "Use New Job Card to register a vehicle, the customer and their request.",
        tips: [
          "Search the customer first to avoid duplicates.",
          "Assign a technician so the job appears on their account.",
        ],
      },
      approvals: {
        title: "Quotations and approvals",
        body: "Build the quotation, then send the approval link to the customer.",
        tips: [
          "Follow up on approvals that are pending for more than a day.",
          "Work only starts after the customer approves.",
        ],
      },
      parts_desk: {
        title: "Parts and purchasing",
        body: "Track part requests from technicians and convert them into purchase orders.",
        tips: [
          "Update each request to Ordered and then Received.",
          "Scan supplier invoices to add stock automatically.",
        ],
      },
      flow: {
        title: "Car Flow board",
        body: "See every vehicle in the workshop by stage and spot bottlenecks.",
        tips: ["Overdue jobs are highlighted so you can act quickly."],
      },
      reports: {
        title: "Reports",
        body: "Review revenue, labour hours, VAT and performance across the workshop.",
        tips: ["Export PDFs and CSVs for accounting."],
      },
      users: {
        title: "Users and roles",
        body: "Invite staff, assign roles and fine-tune permissions per person.",
        tips: [
          "Give each person only the access they need.",
          "Deactivate users who leave instead of deleting them.",
        ],
      },
      alerts: {
        title: "Alerts and warnings",
        body: "The system warns you when you are late, forget to check out, or have overdue work.",
        tips: [
          "Important alerts pop up when you open the CRM.",
          "Open the Alerts button in the top bar to review them again.",
        ],
      },
    },
  },
  alerts: {
    heading: "Attention required",
    subheading: "Please review the items below.",
    none: "You are all caught up. No warnings right now.",
    dismiss: "Dismiss for today",
    open: "Open",
    severity: { critical: "Urgent", warning: "Warning", info: "Reminder" },
    kinds: {
      late_no_checkin: {
        title: "You have not checked in",
        body: "Your shift started {minutes} minutes ago. Check in now — this day is being recorded as late.",
      },
      late_checked_in: {
        title: "Late check-in recorded",
        body: "You checked in {minutes} minutes late today. Repeated lateness may be deducted from salary.",
      },
      forgot_checkout: {
        title: "Remember to check out",
        body: "Your shift ended {minutes} minutes ago and you are still checked in.",
      },
      jobs_overdue: {
        title: "Overdue job cards",
        body: "{count} job card(s) have passed their promised completion time.",
      },
      approvals_pending: {
        title: "Approvals waiting",
        body: "{count} customer approval(s) have been pending for more than 24 hours.",
      },
      parts_pending: {
        title: "Parts requests waiting",
        body: "{count} parts request(s) have not been ordered for more than 24 hours.",
      },
    },
  },
}

const ar: CrmDict = {
  nav: {
    "/crm": "لوحة التحكم",
    "/attendance": "تسجيل الحضور / الانصراف",
    "/control-center": "مركز التحكم الذكي",
    "/finance": "المالية والتدقيق",
    "/reports/vat": "إقرار ضريبة القيمة المضافة",
    "/flow": "حركة السيارات",
    "/jobs": "بطاقات العمل",
    "/appointments": "المواعيد",
    "/history": "السجل",
    "/leads": "العملاء المحتملون",
    "/customers": "العملاء",
    "/invoices": "الفواتير",
    "/marketing": "مركز التحكم بالموقع",
    "/parts": "قطع الغيار",
    "/purchasing": "المشتريات",
    "/purchasing/invoices": "مسح فاتورة",
    "/inventory": "المخزن / المخزون",
    "/suppliers": "الموردون",
    "/reports": "التقارير",
    "/reports/labour": "تقرير العمالة",
    "/users": "المستخدمون والأدوار",
    "/settings": "الإعدادات",
    "/recycle-bin": "سلة المحذوفات",
  },
  groups: {
    Finance: "المالية",
    Workshop: "الورشة",
    "Sales & Customers": "المبيعات والعملاء",
    "Parts & Purchasing": "القطع والمشتريات",
    Insights: "التحليلات",
    Admin: "الإدارة",
  },
  header: {
    newJob: "بطاقة عمل جديدة",
    controlCenter: "مركز التحكم الذكي",
    help: "الدليل",
    alerts: "التنبيهات",
    openMenu: "فتح القائمة",
    closeMenu: "إغلاق القائمة",
    signOut: "تسجيل الخروج",
    workshopCrm: "نظام إدارة الورشة",
  },
  guide: {
    heading: "دليل الحساب",
    stepOf: "الخطوة {n} من {total}",
    back: "السابق",
    next: "التالي",
    finish: "فهمت",
    skip: "تخطي الدليل",
    topics: {
      welcome: {
        title: "مرحباً، {name}",
        body: "يوضح لك هذا الدليل القصير كيفية استخدام حسابك بصفتك {role}. تظهر لك فقط الشاشات التي يسمح بها دورك.",
        tips: [
          "استخدم القائمة الجانبية للتنقل بين الأقسام.",
          "بدّل بين العربية والإنجليزية من زر EN / عربي في الأعلى.",
          "يمكنك فتح هذا الدليل في أي وقت من زر الدليل.",
        ],
      },
      attendance: {
        title: "سجّل الحضور والانصراف يومياً",
        body: "افتح صفحة تسجيل الحضور في بداية ونهاية دوامك. يتم التحقق من موقعك داخل الورشة.",
        tips: [
          "اسمح بالوصول إلى الموقع عندما يطلب هاتفك ذلك.",
          "سجّل حضورك قبل موعد الدوام مع فترة السماح، وإلا يُسجَّل تأخير.",
          "قد يتم خصم التأخير والغياب من الراتب.",
        ],
      },
      my_jobs: {
        title: "بطاقات العمل الخاصة بك",
        body: "تعرض بطاقات العمل جميع السيارات المسندة إليك. افتح البطاقة لرؤية طلب العميل وتفاصيل السيارة.",
        tips: [
          "اقرأ شكوى العميل قبل بدء العمل.",
          "انقل البطاقة إلى المرحلة التالية عند إنهاء مهمتك.",
        ],
      },
      inspection: {
        title: "الفحص والتشخيص",
        body: "أكمل قائمة الفحص وسجّل التشخيص على بطاقة العمل.",
        tips: [
          "حدّد كل بند: سليم أو يحتاج انتباه أو عاجل.",
          "اكتب تشخيصاً واضحاً ليتمكن مستشار الخدمة من التسعير.",
        ],
      },
      photos: {
        title: "رفع صور المشكلة والقطع",
        body: "استخدم قسم الصور لإرفاق الأدلة من كاميرا هاتفك.",
        tips: [
          "اختر فئة المشكلة للأعطال والأضرار.",
          "اختر فئة القطع للقطع القديمة والجديدة.",
          "الصور تساعد العميل على الموافقة على الإصلاح بشكل أسرع.",
        ],
      },
      parts_request: {
        title: "طلب قطع الغيار",
        body: "اطلب القطع التي تحتاجها للتشخيص أو الإصلاح مباشرة من بطاقة العمل.",
        tips: [
          "اختر من اقتراحات الكتالوج لتجنب الأخطاء الإملائية.",
          "سيقوم قسم القطع بتحديث الحالة عند الطلب أو الاستلام.",
        ],
      },
      create_job: {
        title: "إنشاء بطاقات العمل",
        body: "استخدم بطاقة عمل جديدة لتسجيل السيارة والعميل وطلبه.",
        tips: [
          "ابحث عن العميل أولاً لتجنب التكرار.",
          "أسند فنياً حتى تظهر البطاقة في حسابه.",
        ],
      },
      approvals: {
        title: "عروض الأسعار والموافقات",
        body: "أنشئ عرض السعر ثم أرسل رابط الموافقة إلى العميل.",
        tips: [
          "تابع الموافقات المعلّقة لأكثر من يوم.",
          "يبدأ العمل فقط بعد موافقة العميل.",
        ],
      },
      parts_desk: {
        title: "القطع والمشتريات",
        body: "تابع طلبات القطع من الفنيين وحوّلها إلى أوامر شراء.",
        tips: [
          "حدّث كل طلب إلى تم الطلب ثم تم الاستلام.",
          "امسح فواتير الموردين لإضافة المخزون تلقائياً.",
        ],
      },
      flow: {
        title: "لوحة حركة السيارات",
        body: "شاهد كل سيارة في الورشة حسب المرحلة واكتشف أماكن التأخير.",
        tips: ["يتم تمييز البطاقات المتأخرة لتتصرف بسرعة."],
      },
      reports: {
        title: "التقارير",
        body: "راجع الإيرادات وساعات العمل وضريبة القيمة المضافة والأداء في الورشة.",
        tips: ["صدّر ملفات PDF و CSV للمحاسبة."],
      },
      users: {
        title: "المستخدمون والأدوار",
        body: "ادعُ الموظفين وحدّد أدوارهم واضبط صلاحيات كل شخص.",
        tips: [
          "امنح كل شخص الصلاحيات التي يحتاجها فقط.",
          "عطّل حسابات المغادرين بدلاً من حذفها.",
        ],
      },
      alerts: {
        title: "التنبيهات والتحذيرات",
        body: "ينبهك النظام عند التأخير أو نسيان تسجيل الانصراف أو وجود أعمال متأخرة.",
        tips: [
          "تظهر التنبيهات المهمة تلقائياً عند فتح النظام.",
          "افتح زر التنبيهات في الشريط العلوي لمراجعتها مرة أخرى.",
        ],
      },
    },
  },
  alerts: {
    heading: "يتطلب انتباهك",
    subheading: "يرجى مراجعة البنود التالية.",
    none: "لا توجد تحذيرات حالياً.",
    dismiss: "إخفاء لليوم",
    open: "فتح",
    severity: { critical: "عاجل", warning: "تحذير", info: "تذكير" },
    kinds: {
      late_no_checkin: {
        title: "لم تسجّل حضورك بعد",
        body: "بدأ دوامك منذ {minutes} دقيقة. سجّل حضورك الآن — يتم تسجيل هذا اليوم كتأخير.",
      },
      late_checked_in: {
        title: "تم تسجيل تأخير",
        body: "سجّلت حضورك متأخراً {minutes} دقيقة اليوم. التأخير المتكرر قد يُخصم من الراتب.",
      },
      forgot_checkout: {
        title: "تذكّر تسجيل الانصراف",
        body: "انتهى دوامك منذ {minutes} دقيقة وما زلت مسجّلاً كحاضر.",
      },
      jobs_overdue: {
        title: "بطاقات عمل متأخرة",
        body: "{count} بطاقة عمل تجاوزت موعد الإنجاز المحدد.",
      },
      approvals_pending: {
        title: "موافقات بانتظار العميل",
        body: "{count} موافقة معلّقة منذ أكثر من 24 ساعة.",
      },
      parts_pending: {
        title: "طلبات قطع بالانتظار",
        body: "{count} طلب قطع لم يتم طلبه منذ أكثر من 24 ساعة.",
      },
    },
  },
}

export const ROLE_LABELS: Record<Locale, Record<string, string>> = {
  en: {
    owner: "Owner",
    general_manager: "General Manager",
    workshop_manager: "Workshop Manager",
    workshop_supervisor: "Workshop Supervisor",
    service_advisor: "Service Advisor",
    technician: "Technician",
    qc: "Quality Control",
    parts: "Parts Officer",
    accounts: "Accountant",
    receptionist: "Receptionist",
    marketing: "Marketing",
    viewer: "Viewer",
  },
  ar: {
    owner: "المالك",
    general_manager: "المدير العام",
    workshop_manager: "مدير الورشة",
    workshop_supervisor: "مشرف الورشة",
    service_advisor: "مستشار الخدمة",
    technician: "فني",
    qc: "مراقبة الجودة",
    parts: "مسؤول القطع",
    accounts: "محاسب",
    receptionist: "موظف استقبال",
    marketing: "التسويق",
    viewer: "مشاهد",
  },
}

export function roleLabel(locale: Locale, role: string): string {
  return ROLE_LABELS[locale][role] ?? role.replace(/_/g, " ")
}

export function getCrmDict(locale: Locale): CrmDict {
  return locale === "ar" ? ar : en
}

/** Guide topics for a user, chosen from their effective permissions. */
export function guideTopicsFor(perms: Set<string>, isOwner: boolean): GuideTopic[] {
  const topics: GuideTopic[] = ["welcome", "attendance"]
  const has = (p: string) => isOwner || perms.has(p)
  if (has("jobs.view_assigned") || has("jobs.view_all")) topics.push("my_jobs")
  if (has("inspection.manage") || has("diagnostics.manage")) topics.push("inspection", "photos")
  if (has("parts.request")) topics.push("parts_request")
  if (has("jobs.create")) topics.push("create_job")
  if (has("quotations.manage") || has("jobs.view_all")) topics.push("approvals")
  if (has("purchase_orders.manage")) topics.push("parts_desk")
  if (has("jobs.view_all")) topics.push("flow")
  if (has("reports.view")) topics.push("reports")
  if (has("users.manage") || has("permissions.manage")) topics.push("users")
  topics.push("alerts")
  return Array.from(new Set(topics))
}
