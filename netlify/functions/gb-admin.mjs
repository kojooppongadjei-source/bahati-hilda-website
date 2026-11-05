// POST /api/gb/admin  (header x-pin = ADMIN_PASSWORD)
//   list | reconcile | resend {code}
//   issue {name, phone, email?, method, reference, amount?}  -> ticket for a payment made outside the website (MoMo merchant code, cash)
import { json, fail, kv, isAdmin, issueTicket, sendTicketEmail, attendees, cleanCode, CAPACITY, PRICE, CURRENCY, SITE, newCode, normalizePhone, validEmail } from "../lib/gb.mjs";

export default async (req) => {
  if (req.method !== "POST") return fail("Method not allowed", 405);
  if (!(await isAdmin(req))) return fail("Wrong PIN.", 401);
  const body = await req.json().catch(() => ({}));

  if (body.action === "list") {
    const [attempts, paid] = await Promise.all([kv.all("t/"), attendees()]);
    const paidByRef = Object.fromEntries(paid.map((p) => [p.tx_ref, p]));
    const rows = attempts
      .map((a) => (a.status === "paid" && paidByRef[a.tx_ref] ? { ...paidByRef[a.tx_ref], status: "paid" } : a))
      .sort((a, b) => String(b.paid_at || b.created_at).localeCompare(String(a.paid_at || a.created_at)));
    return json({
      rows,
      totals: {
        sold: paid.length,
        revenue: paid.reduce((s, r) => s + Number(r.amount), 0),
        checked_in: paid.filter((r) => r.used_at).length,
        pending: attempts.filter((r) => r.status === "pending").length,
        capacity: CAPACITY() || null,
      },
    });
  }

  if (body.action === "reconcile") {
    const since = Date.now() - 3 * 864e5;
    const pending = (await kv.all("t/")).filter((r) => r.status === "pending" && Date.parse(r.created_at) > since);
    let paid = 0, failed = 0;
    for (const p of pending) {
      const r = await issueTicket(p.tx_ref).catch(() => ({ state: "pending" }));
      if (r.state === "paid") paid++;
      if (r.state === "failed") failed++;
    }
    return json({ checked: pending.length, paid, failed });
  }

  if (body.action === "resend") {
    const code = cleanCode(body.code);
    const t = code && (await kv.get(`p/${code}`));
    if (!t) return fail("Ticket not found.", 404);
    await sendTicketEmail(t);
    return json({ ok: true });
  }

  if (body.action === "issue") {
    const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 80);
    const phone = normalizePhone(body.phone);
    const email = String(body.email || "").trim().toLowerCase().slice(0, 120);
    const method = body.method === "cash" ? "cash" : "momo_merchant";
    const reference = String(body.reference || "").trim().replace(/[^A-Za-z0-9-]/g, "").slice(0, 40);
    const amount = parseInt(body.amount || PRICE(), 10);
    if (name.length < 3) return fail("Enter the attendee's full name.");
    if (!phone) return fail("Enter a valid phone number.");
    if (email && !validEmail(email)) return fail("That email address doesn't look right. Leave it blank if they don't have one.");
    if (method === "momo_merchant" && reference.length < 4) return fail("Enter the MoMo transaction ID from the payment SMS.");
    if (!(amount > 0)) return fail("Enter the amount paid.");
    const cap = CAPACITY();
    if (cap > 0 && (await kv.count("p/")) >= cap) return fail("All seats are sold.", 409);

    // The same MoMo transaction can't be turned into two tickets.
    if (reference && !(await kv.create(`r/${reference.toUpperCase()}`, { at: new Date().toISOString() })))
      return fail(`A ticket was already issued for transaction ${reference}.`, 409);

    const code = newCode();
    const now = new Date().toISOString();
    const tx_ref = `GB27-MANUAL-${code.slice(5)}`;
    const ticket = { code, tx_ref, name, phone, email, amount, currency: CURRENCY, payment_type: method,
      reference: reference || null, created_at: now, paid_at: now };
    await kv.set(`p/${code}`, ticket);
    await kv.set(`t/${tx_ref}`, { ...ticket, status: "paid" });
    let emailed = false;
    if (email) emailed = await sendTicketEmail(ticket).then(() => true).catch((e) => (console.error(e), false));
    return json({ ok: true, code, emailed, link: `${SITE()}/glory-blueprint-2027/ticket/?t=${code}` });
  }

  return fail("Unknown action.");
};
export const config = { path: "/api/gb/admin" };
