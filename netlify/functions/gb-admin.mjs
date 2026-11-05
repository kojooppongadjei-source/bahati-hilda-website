// POST /api/gb/admin  (header x-pin = ADMIN_PASSWORD)
//   list | reconcile | resend {code}
import { json, fail, kv, isAdmin, issueTicket, sendTicketEmail, attendees, cleanCode } from "../lib/gb.mjs";

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
        capacity: parseInt(process.env.GB_CAPACITY || "0", 10) || null,
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

  return fail("Unknown action.");
};
export const config = { path: "/api/gb/admin" };
