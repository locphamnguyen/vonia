/* Feature switches for the web UI.

   PAYMENTS_ENABLED — SePay checkout (plan button, license/plan cards, VietQR
   modal, payment return handler). Turned off: Vonia no longer sells plans.
   The code is kept so it can be switched back on; the backend routes are
   gated separately by VONIA_PAYMENTS (see omnivoice/server/app.py). */
export const PAYMENTS_ENABLED = false
