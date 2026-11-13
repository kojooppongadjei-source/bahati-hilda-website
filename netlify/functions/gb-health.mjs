// GET /api/gb/health -> is ticketing able to store tickets, take payments and send email? (no secrets shown)
import { json, kv, storageRoute, storageNote } from "../lib/gb.mjs";

export default async () => {
  const out = {
    storage: false, storage_route: null, tickets_sold: null,
    flutterwave_key_set: !!process.env.FLW_SECRET_KEY,
    email_password_set: !!process.env.SMTP_PASSWORD,
    staff_pins_set: !!process.env.GB_STAFF_PINS,
    checked_at: new Date().toISOString(),
  };
  try {
    await kv.set("health/last", { at: out.checked_at });
    out.tickets_sold = await kv.count("p/");
    out.storage = true;
    out.storage_route = storageRoute();
  } catch (e) {
    out.storage_error = `${e?.name || "Error"}: ${String(e?.message || e).slice(0, 200)}`;
  }
  if (storageNote) out.storage_note = storageNote;
  out.ok = out.storage && out.flutterwave_key_set && out.email_password_set;
  return json(out, out.ok ? 200 : 500);
};
export const config = { path: "/api/gb/health" };
