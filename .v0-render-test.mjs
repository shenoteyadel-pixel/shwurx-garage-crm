import crypto from "node:crypto"
import { writeFileSync } from "node:fs"

const SECRET = process.env.SUPABASE_JWT_SECRET
const SUPA_URL = process.env.SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const REF = new URL(SUPA_URL).hostname.split(".")[0]
const USER_ID = "4a39239b-16a5-4c08-8a89-78bcfe620f76"
const EMAIL = "abdarhmanm743@gmail.com"
const INVOICE = "c0b4b346-d132-470b-9a7f-dc3ddac9ee61"

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

const now = Math.floor(Date.now() / 1000)
const exp = now + 3600
const header = { alg: "HS256", typ: "JWT" }
const payload = {
  sub: USER_ID, email: EMAIL, role: "authenticated", aud: "authenticated",
  iss: `${SUPA_URL}/auth/v1`, iat: now, exp,
}
const si = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
const sig = b64url(crypto.createHmac("sha256", SECRET).update(si).digest())
const accessToken = `${si}.${sig}`
const session = {
  access_token: accessToken, token_type: "bearer", expires_in: 3600, expires_at: exp,
  refresh_token: "v0-dummy",
  user: { id: USER_ID, aud: "authenticated", role: "authenticated", email: EMAIL },
}
const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64")
const cookie = `sb-${REF}-auth-token=${value}`

async function patch(body) {
  const r = await fetch(`${SUPA_URL}/rest/v1/supplier_invoices?id=eq.${INVOICE}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE, Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json", Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  })
  return `${r.status} ${(await r.text()).slice(0, 200)}`
}

const url = `http://localhost:3000/purchasing/invoices/${INVOICE}`
try {
  console.log("[flip->confirmed]", await patch({ status: "confirmed", doc_number: "TEST-441", confirmed_at: new Date().toISOString() }))
  const res = await fetch(url, { headers: { Cookie: cookie }, redirect: "manual" })
  const html = await res.text()
  writeFileSync("/tmp/confirmed.html", html)
  console.log("[render] HTTP", res.status, "len", html.length)
  const markers = ["Minified React error", "error #4", "Application error", "Payments", "Record payment", "Something went wrong", "auth/login", "Supplier Invoice"]
  for (const m of markers) if (html.includes(m)) console.log("  marker:", m)
} catch (e) {
  console.log("[error]", e.message)
} finally {
  console.log("[revert->draft]", await patch({ status: "draft", doc_number: null, confirmed_at: null }))
}
