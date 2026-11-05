// GET /api/gb/ticket?t=GB27-XXXXXXXX -> ticket + QR for the buyer's ticket page
import { json, fail, kv, cleanCode, qrDataUrl, EVENT } from "../lib/gb.mjs";

export default async (req) => {
  const code = cleanCode(new URL(req.url).searchParams.get("t"));
  if (!code) return fail("Invalid ticket code.", 404);
  const t = await kv.get(`p/${code}`);
  if (!t) return fail("Ticket not found.", 404);
  const used = await kv.get(`u/${code}`);
  const [u, d] = (t.email || "").split("@");
  return json({
    name: t.name,
    email: d ? `${u.slice(0, 2)}${"•".repeat(Math.max(1, u.length - 2))}@${d}` : null,
    code: t.code, amount: t.amount, currency: t.currency,
    used_at: used?.used_at || null,
    qr: await qrDataUrl(t.code),
    event: EVENT,
  });
};
export const config = { path: "/api/gb/ticket" };
