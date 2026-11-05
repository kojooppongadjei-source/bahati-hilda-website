// POST /api/gb/webhook  Flutterwave webhook (optional safety net). Ignores non-ticket payments.
import { json, issueTicket, validTxRef } from "../lib/gb.mjs";

export default async (req) => {
  const hash = process.env.FLW_SECRET_HASH;
  if (!hash || req.headers.get("verif-hash") !== hash) return json({ ok: false }, 401);
  const body = await req.json().catch(() => ({}));
  const txRef = body?.data?.tx_ref || body?.txRef || body?.tx_ref;
  if (!validTxRef(txRef)) return json({ ok: true, ignored: true });
  try {
    return json({ ok: true, state: (await issueTicket(txRef)).state });
  } catch (e) {
    console.error(e);
    return json({ ok: false }, 500); // Flutterwave retries
  }
};
export const config = { path: "/api/gb/webhook" };
