# SHWURX Website → CRM integration

The public SHWURX marketing website is a **separate app**. It talks to this CRM
through three public HTTP endpoints. No API keys or secrets are needed on the
website — every write goes through a hardened `SECURITY DEFINER` database
function, and the endpoints accept cross-origin requests.

Replace `https://YOUR-CRM-DOMAIN` below with this CRM's deployed URL.

---

## 1. Drop-in tracking snippet (easiest)

Paste this once, ideally just before `</body>`:

```html
<script
  src="https://YOUR-CRM-DOMAIN/embed/shwurx-track.js"
  data-endpoint="https://YOUR-CRM-DOMAIN"
></script>
```

It automatically:

- tracks a `page_view` on load and on SPA route changes,
- captures `utm_source` / `utm_medium` / `utm_campaign` and the referrer,
- keeps a per-session id,
- derives device type server-side.

It exposes a tiny API on `window.SHWURX`:

```js
// Track a custom event (e.g. a button click)
SHWURX.track("cta_click", { label: "Book now" })

// Submit a booking (returns a Promise)
SHWURX.submitAppointment({
  name: "Ahmed",
  phone: "0501234567",
  vehicleMake: "Toyota",
  vehicleModel: "Land Cruiser",
  serviceInterest: "Major Service",
  preferredDate: "2026-01-20",
  preferredTime: "Morning",
  notes: "Pulling to the left when braking",
}).then((res) => {
  if (res.ok) showThankYou()
})

// Submit a contact / enquiry lead (returns a Promise)
SHWURX.submitLead({
  name: "Sara",
  phone: "0559876543",
  email: "sara@example.com",
  message: "Do you service electric cars?",
  serviceInterest: "General enquiry",
})
```

---

## 2. Raw HTTP contract (if you'd rather call it directly)

All endpoints are `POST`, accept and return JSON, and are CORS-enabled.
Responses look like `{ "ok": true, "id": "<uuid>" }` or
`{ "ok": false, "error": "<reason>" }`.

### `POST /api/public/track`
Fire-and-forget analytics. Required: `eventType`.

```json
{
  "eventType": "page_view",
  "sessionId": "abc123",
  "pagePath": "/services",
  "referrer": "https://google.com",
  "source": "organic_search",
  "medium": "cpc",
  "campaign": "spring",
  "device": "mobile",
  "metadata": {}
}
```

### `POST /api/public/appointments`
Booking request. Required: `name`, `phone`. Notifies front-desk staff.

```json
{
  "name": "Ahmed",
  "phone": "0501234567",
  "email": "ahmed@example.com",
  "vehicleMake": "Toyota",
  "vehicleModel": "Land Cruiser",
  "vehicleYear": "2021",
  "plateNumber": "A 12345",
  "serviceInterest": "Major Service",
  "preferredDate": "2026-01-20",
  "preferredTime": "Morning",
  "notes": "Pulling to the left",
  "source": "website"
}
```

### `POST /api/public/leads`
Contact / enquiry form. Required: at least one of `phone` or `email`.

```json
{
  "name": "Sara",
  "phone": "0559876543",
  "email": "sara@example.com",
  "message": "Do you service EVs?",
  "serviceInterest": "General enquiry",
  "source": "website"
}
```

---

## 3. Locking down origins (recommended for production)

By default the endpoints allow any origin (safe: no credentials, write-only).
To restrict to the live website, set an env var on this CRM project:

```
PUBLIC_WEBSITE_ORIGINS=https://shwurx.com,https://www.shwurx.com
```

Once set, only those origins are echoed in `Access-Control-Allow-Origin`.

---

Bookings appear in the CRM under **Appointments**, where the front desk can
confirm, reschedule, cancel, or convert them into a job card. Enquiries appear
under **Leads**. Analytics feed the Website dashboard.
