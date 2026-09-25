import crypto from "node:crypto"

const SECRET = process.env.SUPABASE_JWT_SECRET
const SUPA_URL = process.env.SUPABASE_URL
const REF = new URL(SUPA_URL).hostname.split(".")[0]
const USER_ID = "4a39239b-16a5-4c08-8a89-78bcfe620f76"
const EMAIL = "abdarhmanm743@gmail.com"

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

const now = Math.floor(Date.now() / 1000)
const exp = now + 3600
const header = { alg: "HS256", typ: "JWT" }
const payload = {
  sub: USER_ID,
  email: EMAIL,
  role: "authenticated",
  aud: "authenticated",
  iss: `${URL}/auth/v1`,
  iat: now,
  exp,
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
}
const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
const sig = b64url(crypto.createHmac("sha256", SECRET).update(signingInput).digest())
const accessToken = `${signingInput}.${sig}`

const session = {
  access_token: accessToken,
  token_type: "bearer",
  expires_in: 3600,
  expires_at: exp,
  refresh_token: "v0-dummy-refresh",
  user: {
    id: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: EMAIL,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: new Date().toISOString(),
  },
}

// @supabase/ssr stores: base64- prefix + base64(JSON), chunked at 3180.
const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64")
const name = `sb-${REF}-auth-token`
const MAX = 3180
const cookies = []
if (value.length <= MAX) {
  cookies.push(`${name}=${value}`)
} else {
  for (let i = 0, idx = 0; i < value.length; i += MAX, idx++) {
    cookies.push(`${name}.${idx}=${value.slice(i, i + MAX)}`)
  }
}
process.stdout.write(cookies.join("; "))
