// POST /api/gb/verify  { tx_ref } -> checks with Flutterwave, issues the ticket once paid
import { json, fail, issueTicket, validTxRef } from "../lib/gb.mjs";

export default async (req) => {
  if (req.method !== "POST") return fail("Method not allowed", 405);
  const { tx_ref } = await req.json().catch(() => ({}));
  if (!validTxRef(tx_ref)) return fail("Invalid reference.");
  const r = await issueTicket(tx_ref);
  return json(r.state === "paid" ? { state: "paid", code: r.ticket.code } : { state: r.state, reason: r.reason });
};
export const config = { path: "/api/gb/verify" };
