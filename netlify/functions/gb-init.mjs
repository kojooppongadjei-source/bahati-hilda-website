// POST /api/gb/init  { name, phone, email } -> starts a checkout
import { json, fail, kv, PRICE, CURRENCY, SITE, EVENT, FLW_PUBLIC, newTxRef, normalizePhone, validEmail , CAPACITY } from "../lib/gb.mjs";

export default async (req) => {
  if (req.method !== "POST") return fail("Method not allowed", 405);
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 80);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 120);
  const phone = normalizePhone(body.phone);

  if (name.length < 3) return fail("Enter your full name.");
  if (!phone) return fail("Enter a valid phone number, for example 0772 123 456.");
  if (!validEmail(email)) return fail("Enter a valid email address. Your ticket will be sent there.");

  const close = process.env.GB_SALES_CLOSE; // e.g. 2026-11-28T09:00:00+03:00
  if (close && Date.now() > Date.parse(close)) return fail("Online ticket sales have closed.", 409);
  const capacity = CAPACITY();
  if (capacity > 0 && (await kv.count("p/")) >= capacity) return fail("This event is sold out.", 409);

  const amount = PRICE();
  const tx_ref = newTxRef();
  await kv.set(`t/${tx_ref}`, { tx_ref, name, phone, email, amount, currency: CURRENCY, status: "pending", created_at: new Date().toISOString() });

  return json({
    public_key: FLW_PUBLIC(), tx_ref, amount, currency: CURRENCY,
    redirect_url: `${SITE()}/glory-blueprint-2027/ticket/?ref=${tx_ref}`,
    customer: { name, email, phone_number: phone },
    title: EVENT.name,
  });
};
export const config = { path: "/api/gb/init" };
