/*!
 * SHWURX website tracking snippet (drop-in).
 * Paste ONE script tag on the marketing site:
 *
 *   <script src="https://YOUR-CRM-DOMAIN/embed/shwurx-track.js"
 *           data-endpoint="https://YOUR-CRM-DOMAIN"></script>
 *
 * It auto-tracks page views and exposes a small API:
 *
 *   SHWURX.track('cta_click', { label: 'Book now' })
 *   SHWURX.submitAppointment({ name, phone, ... })   // returns Promise
 *   SHWURX.submitLead({ name, phone, email, ... })   // returns Promise
 *
 * No secrets live here. It only POSTs to the public ingestion endpoints,
 * which write through SECURITY DEFINER RPCs.
 */
(function () {
  "use strict"

  var script = document.currentScript
  var ENDPOINT = (script && script.getAttribute("data-endpoint")) || ""
  ENDPOINT = ENDPOINT.replace(/\/$/, "")

  // ---- session id (30-min sliding window, stored in sessionStorage) --------
  function sessionId() {
    try {
      var key = "shwurx_sid"
      var sid = sessionStorage.getItem(key)
      if (!sid) {
        sid = (Date.now().toString(36) + Math.random().toString(36).slice(2, 10))
        sessionStorage.setItem(key, sid)
      }
      return sid
    } catch (e) {
      return null
    }
  }

  // ---- UTM / source capture (persisted for the session) --------------------
  function captureAttribution() {
    var params = new URLSearchParams(window.location.search)
    var utm = {
      source: params.get("utm_source"),
      medium: params.get("utm_medium"),
      campaign: params.get("utm_campaign"),
    }
    try {
      var stored = JSON.parse(sessionStorage.getItem("shwurx_attr") || "null")
      if (!stored && (utm.source || utm.medium || utm.campaign)) {
        sessionStorage.setItem("shwurx_attr", JSON.stringify(utm))
        stored = utm
      }
      return stored || utm
    } catch (e) {
      return utm
    }
  }

  function derivedSource(attr) {
    if (attr && attr.source) return attr.source
    var ref = document.referrer || ""
    if (!ref) return "direct"
    try {
      var host = new URL(ref).hostname.replace(/^www\./, "")
      if (/google|bing|yahoo|duckduckgo/.test(host)) return "organic_search"
      if (/facebook|instagram|twitter|t\.co|linkedin|tiktok/.test(host)) return "social"
      return host
    } catch (e) {
      return "referral"
    }
  }

  function post(path, payload) {
    if (!ENDPOINT) return Promise.reject(new Error("SHWURX: data-endpoint not set"))
    return fetch(ENDPOINT + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
      mode: "cors",
    })
      .then(function (r) { return r.json().catch(function () { return {} }) })
  }

  function track(eventType, metadata) {
    var attr = captureAttribution()
    return post("/api/public/track", {
      eventType: eventType,
      sessionId: sessionId(),
      pagePath: window.location.pathname + window.location.search,
      referrer: document.referrer || null,
      source: derivedSource(attr),
      medium: (attr && attr.medium) || null,
      campaign: (attr && attr.campaign) || null,
      metadata: metadata || {},
    }).catch(function () { /* analytics is best-effort */ })
  }

  function submitAppointment(data) {
    return post("/api/public/appointments", data || {})
  }

  function submitLead(data) {
    return post("/api/public/leads", data || {})
  }

  // ---- auto page-view (incl. SPA route changes via history API) ------------
  function pageView() { track("page_view") }
  pageView()

  var _push = history.pushState
  history.pushState = function () {
    _push.apply(this, arguments)
    pageView()
  }
  window.addEventListener("popstate", pageView)

  // Expose the API.
  window.SHWURX = {
    track: track,
    submitAppointment: submitAppointment,
    submitLead: submitLead,
  }
})()
