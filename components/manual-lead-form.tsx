"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { Modal } from "@/components/modal"
import { Button, Input, Label, Select, Textarea } from "@/components/ui"
import { useI18n } from "@/lib/i18n/provider"
import { createManualLead, recordManualLeadFollowUp } from "@/lib/actions-manual-leads"
import type { LeadRow } from "@/lib/actions-leads"
import { REPORTED_SOURCES, type ManualLeadResult } from "@/lib/manual-lead"

const sourceLabels: Record<string, [string, string]> = {
  unknown: ["Unknown", "غير معروف"], google_search: ["Google Search", "بحث جوجل"], google_ads: ["Google ad", "إعلان جوجل"],
  facebook: ["Facebook", "فيسبوك"], instagram: ["Instagram", "إنستغرام"], referral: ["Referral", "ترشيح"],
  returning_customer: ["Returning customer", "عميل سابق"], other: ["Other", "غير ذلك"],
}

export function AddManualLead({ lead }: { lead?: LeadRow } = {}) {
  const { lang, dir } = useI18n()
  const ar = lang === "ar"
  const t = (en: string, arabic: string) => ar ? arabic : en
  const router = useRouter()
  const md = lead?.metadata ?? {}
  const editing = !!lead
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [submissionId, setSubmissionId] = useState("")
  const [channel, setChannel] = useState("whatsapp")
  const [result, setResult] = useState<ManualLeadResult | null>(null)
  const [notice, setNotice] = useState("")
  const [occurredAt, setOccurredAt] = useState("")
  function begin() {
    setSubmissionId(crypto.randomUUID())
    setOccurredAt(new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 16))
    setResult(null); setNotice(""); setChannel(editing ? String(md.contact_channel ?? "whatsapp") : "whatsapp"); setOpen(true)
  }
  const errors: Record<string, string> = {
    unauthorized: t("Sign in again before saving.", "سجّل الدخول مرة أخرى قبل الحفظ."),
    forbidden: t("Your role cannot manage leads.", "صلاحيتك لا تسمح بإدارة العملاء المحتملين."),
    invalid: t("Review the highlighted fields. Qualified needs an answered call or two-way conversation, vehicle details, fault and qualification evidence.", "راجع الحقول المحددة. التأهيل يتطلب مكالمة مُجابة أو محادثة فعلية وبيانات السيارة والعطل ودليل التأهيل."),
    unavailable: t("Could not confirm saving. Retry this same form; do not create another entry.", "تعذر تأكيد الحفظ. أعد المحاولة بنفس النموذج، ولا تنشئ سجلًا آخر."),
    conflict: t("This record changed or this request was already saved with different details. Keep your evidence, close and reload the record.", "تغير السجل أو حُفظ هذا الطلب ببيانات مختلفة. احتفظ بالدليل ثم أغلق النموذج وأعد تحميل السجل."),
    existing_contact: t("An open lead already uses this phone. Add a follow-up note there instead of duplicating it.", "يوجد سجل مفتوح بهذا الهاتف. أضف ملاحظة متابعة إليه بدلًا من تكراره."),
  }
  const invalid = (key: string) => !!(result && !result.ok && result.fields?.[key])
  const field = (name: string, label: string, props: React.ComponentProps<typeof Input> = {}) => <div>
    <Label htmlFor={`manual-${name}`}>{label}</Label>
    <Input id={`manual-${name}`} name={name} aria-invalid={invalid(name)} {...props} />
  </div>
  return <>
    <div>
      <Button size={editing ? "sm" : "md"} variant={editing ? "outline" : "primary"} onClick={begin}><Plus className="h-4 w-4" />{editing ? t("Record follow-up", "تسجيل متابعة") : t("Add lead", "إضافة استفسار")}</Button>
      {notice ? <p role="status" className="mt-2 text-sm text-foreground">{notice}</p> : null}
    </div>
    <Modal open={open} onClose={() => { if (!pending) setOpen(false) }} title={editing ? t("Record follow-up", "تسجيل متابعة") : t("Add WhatsApp / phone lead", "إضافة استفسار واتساب / هاتف")}>
      <form dir={dir} onSubmit={(event) => {
        event.preventDefault()
        if (pending) return
        const fd = new FormData(event.currentTarget)
        const values = Object.fromEntries(fd.entries())
        startTransition(async () => {
          try {
            const input = { ...values, submissionId, channel, occurredAt: `${values.occurredAt}:00+04:00` }
            const r = lead ? await recordManualLeadFollowUp(lead.id, input) : await createManualLead(input)
            setResult(r)
            if (r.ok) {
              setNotice(r.outcome === "dry_run" ? t("Preview validated. No lead was saved.", "تم فحص المعاينة دون حفظ أي سجل.") : t("Lead saved. Its source is staff-reported, not verified ad attribution.", "تم حفظ الاستفسار. المصدر مسجّل بواسطة الموظف وليس إسنادًا إعلانيًا مثبتًا."))
              setOpen(false)
              if (r.outcome !== "dry_run") router.refresh()
            }
          } catch { setResult({ ok: false, error: "unavailable" }) }
        })
      }} className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("Record a real incoming contact from the business inbox or phone log. This form does not send messages or advertising conversions.", "سجّل تواصلًا واردًا حقيقيًا من صندوق الشركة أو سجل الهاتف. هذا النموذج لا يرسل رسائل أو تحويلات إعلانية.")}</p>
        <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
          {field("name", t("Name (use Unknown caller if not known)", "الاسم (اكتب متصل غير معروف إذا لم يُعرف)"), { required: true, maxLength: 160, minLength: 2, defaultValue: lead?.name, readOnly: editing })}
          {field("phone", t("Phone", "الهاتف"), { required: true, type: "tel", maxLength: 24, dir: "ltr", defaultValue: lead?.phone ?? "", readOnly: editing })}
          <div><Label htmlFor="manual-channel">{t("Incoming channel", "قناة التواصل الوارد")}</Label>
            <Select id="manual-channel" value={channel} onChange={(e) => setChannel(e.target.value)}><option value="whatsapp">WhatsApp</option><option value="phone">{t("Phone", "هاتف")}</option></Select></div>
          <div><Label htmlFor="manual-contactResult">{t("Contact evidence", "نتيجة التواصل المثبتة")}</Label>
            <Select key={channel} id="manual-contactResult" name="contactResult" required defaultValue={editing ? "" : undefined} aria-invalid={invalid("contactResult")}>
              {editing ? <option value="" disabled>{t("Choose the actual result", "اختر النتيجة الفعلية")}</option> : null}
              {channel === "whatsapp" ? <><option value="received">{t("Message received; no two-way conversation yet", "رسالة مستلمة دون محادثة متبادلة بعد")}</option><option value="conversation">{t("Two-way conversation confirmed", "محادثة متبادلة مثبتة")}</option></> : <><option value="missed">{t("Missed / unanswered call", "مكالمة فائتة / دون رد")}</option><option value="answered">{t("Answered call confirmed", "مكالمة مُجابة مثبتة")}</option></>}
            </Select></div>
          {field("make", t("Vehicle make (if known)", "ماركة السيارة إن عُرفت"), { maxLength: 80, defaultValue: String(md.vehicle_make ?? "") })}
          {field("model", t("Model (if known)", "الموديل إن عُرف"), { maxLength: 80, defaultValue: String(md.vehicle_model ?? "") })}
          {field("year", t("Year (if known)", "سنة الصنع إن عُرفت"), { inputMode: "numeric", maxLength: 4, defaultValue: String(md.vehicle_year ?? "") })}
          {field("occurredAt", t("Contact time — Dubai", "وقت التواصل — دبي"), { required: true, type: "datetime-local", value: occurredAt, onChange: (e) => setOccurredAt(e.target.value) })}
          <div className="sm:col-span-2"><Label htmlFor="manual-fault">{t("Fault / repair requested", "العطل / الإصلاح المطلوب")}</Label><Textarea id="manual-fault" name="fault" maxLength={1500} defaultValue={String(md.fault ?? "")} aria-invalid={invalid("fault")} /></div>
          <div><Label htmlFor="manual-reportedSource">{t("Original source reported by customer", "المصدر الأصلي حسب كلام العميل")}</Label>{editing ? <><Input readOnly value={sourceLabels[String(md.reported_source)]?.[ar ? 1 : 0] ?? String(md.reported_source)} /><input type="hidden" name="reportedSource" value={String(md.reported_source)} /></> : <Select id="manual-reportedSource" name="reportedSource">{REPORTED_SOURCES.map(s => <option key={s} value={s}>{sourceLabels[s][ar ? 1 : 0]}</option>)}</Select>}</div>
          {field("sourceDetail", t("Source detail (optional)", "تفصيل المصدر (اختياري)"), { maxLength: 200, defaultValue: String(md.reported_source_detail ?? ""), readOnly: editing })}
          <div className="sm:col-span-2"><Label htmlFor="manual-evidence">{t("Evidence note: inbox time / answered call log / duration if shown", "ملاحظة الدليل: وقت الرسالة / سجل المكالمة المُجابة / المدة إن ظهرت")}</Label><Textarea id="manual-evidence" name="evidence" required minLength={8} maxLength={1000} aria-invalid={invalid("evidence")} /></div>
          <div><Label htmlFor="manual-followUpResult">{t("Follow-up result", "نتيجة المتابعة")}</Label><Select id="manual-followUpResult" name="followUpResult" required defaultValue={editing ? "" : undefined}>{editing ? <option value="" disabled>{t("Choose the actual result", "اختر النتيجة الفعلية")}</option> : null}<option value="pending">{t("Not assessed yet", "لم يُقيّم بعد")}</option><option value="follow_up">{t("Follow-up required", "يحتاج متابعة")}</option><option value="qualified">{t("Qualified repair enquiry", "استفسار إصلاح مؤهل")}</option><option value="not_suitable">{t("Not suitable / lost", "غير مناسب / مفقود")}</option></Select></div>
          {field("nextAction", t("Next action / owner", "الخطوة التالية / المسؤول"), { maxLength: 500 })}
          <div className="sm:col-span-2"><Label htmlFor="manual-qualification">{t("Qualification / rejection reason", "سبب التأهيل / عدم الملاءمة")}</Label><Textarea id="manual-qualification" name="qualification" maxLength={1000} aria-invalid={invalid("qualification")} placeholder={t("Confirmed vehicle, repair need and intent to visit; no invented estimate or sale.", "السيارة والعطل ونية الزيارة المثبتة؛ دون قيمة أو بيع افتراضي.")} /></div>
        </fieldset>
        {result && !result.ok ? <div role="alert" className="text-sm text-red-400"><p>{errors[result.error]}</p>{result.fields ? <p>{Object.keys(result.fields).join(", ")}</p> : null}{result.existingId ? <a href={`/leads?lead=${result.existingId}#lead-${result.existingId}`} className="underline">{t("Open existing lead", "فتح السجل الموجود")}</a> : null}</div> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>{t("Cancel", "إلغاء")}</Button><Button type="submit" disabled={pending}>{pending ? t("Saving…", "جارٍ الحفظ…") : t("Save lead", "حفظ الاستفسار")}</Button></div>
      </form>
    </Modal>
  </>
}
