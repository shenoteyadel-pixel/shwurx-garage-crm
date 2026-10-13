import "server-only"
import Stripe from "stripe"

/**
 * Server-only Stripe client. The pinned API version travels with the installed
 * SDK (stripe v22 → 2026-08-26.dahlia), so we don't override apiVersion.
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

/**
 * True only with live keys. Sandbox (sk_test_) checkout shows a "TEST MODE"
 * banner and can't take real money, so customers never see it.
 */
export const stripeLiveMode = /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? "")
