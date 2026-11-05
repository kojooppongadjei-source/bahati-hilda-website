// The Glory Blueprint 2027 ticketing: shared helpers.
// Storage: Netlify Blobs (same NETLIFY_SITE_ID / NETLIFY_BLOBS_TOKEN as the rest of the site).
// Email:   the site's existing SMTP mailbox (info@bahatihildasabiti.com, SMTP_PASSWORD).
// Payment: the site's existing Flutterwave account (FLW_SECRET_KEY).
//
// Blob keys in store "gb27-tickets":
//   t/<tx_ref>   every checkout attempt (pending / paid / failed)
//   i/<tx_ref>   issue lock -> { code }      (written once: one ticket per payment)
//   p/<CODE>     paid ticket                 (the attendee list)
//   u/<CODE>     check-in record             (written once: a ticket can't be used twice)
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";
import nodemailer from "nodemailer";
import QRCode from "qrcode";

const env = (k, d) => process.env[k] || d;

export const EVENT = {
  name: "The Glory Blueprint 2027",
  host: "Bahati Hilda Sabiti",
  date: "Saturday, 28 November 2026",
  time: "11:00 AM",
  venue: "UCF Makerere",
  includes:
    "Admission for one person to The Glory Blueprint 2027 planning experience: guided prayer, reflection, and planning for the year ahead across life, family, career, business, or ministry. Includes a workbook, planning templates, a notebook and pen, lunch, drinks, and tea.",
  contactPhone: "+256 757 117 117",
};

// Same live public key the bookstore and academy pages use; override with FLW_PUBLIC_KEY if needed.
export const FLW_PUBLIC = () => env("FLW_PUBLIC_KEY", "FLWPUBK-0ca4b5cd4a979d874b5aafe0f61a23da-X");
// 300 seats; override with GB_CAPACITY (0 = unlimited)
export const CAPACITY = () => parseInt(env("GB_CAPACITY", "300"), 10);
export const PRICE = () => parseInt(env("GB_PRICE_UGX", "150000"), 10);
export const CURRENCY = "UGX";
export const SITE = () => env("SITE_URL", "https://bahatihildasabiti.com").replace(/\/$/, "");
export const TX_PREFIX = "GB27-TX-";

// ---------- HTTP ----------
export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
export const fail = (message, status = 400) => json({ error: message }, status);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Storage ----------
let _store;
const store = () =>
  (_store ||= getStore({ name: "gb27-tickets", siteID: env("NETLIFY_SITE_ID"), token: env("NETLIFY_BLOBS_TOKEN") }));

export const kv = {
  get: (key) => store().get(key, { type: "json" }),
  set: (key, val) => store().setJSON(key, val),
  // Atomic create: returns true only for the first writer.
  create: async (key, val) => (await store().setJSON(key, val, { onlyIfNew: true })).modified,
  async keys(prefix) {
    const { blobs } = await store().list({ prefix });
    return blobs.map((b) => b.key);
  },
  async all(prefix) {
    const keys = await kv.keys(prefix);
    const out = [];
    for (let i = 0; i < keys.length; i += 25) {
      const batch = await Promise.all(keys.slice(i, i + 25).map((k) => kv.get(k)));
      out.push(...batch.filter(Boolean));
    }
    return out;
  },
  count: async (prefix) => (await kv.keys(prefix)).length,
};

// ---------- Validation ----------
export function normalizePhone(raw = "") {
  let p = String(raw).replace(/[^\d+]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("0") && p.length === 10) p = "256" + p.slice(1); // 07XXXXXXXX -> 2567XXXXXXXX
  if (p.length === 9 && p.startsWith("7")) p = "256" + p;
  return p.length >= 10 && p.length <= 15 ? p : null;
}
export const validEmail = (e = "") => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

// ---------- Codes ----------
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
export function newCode() {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `GB27-${s}`;
}
export const newTxRef = () => `${TX_PREFIX}${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
export const validTxRef = (r) => /^GB27-TX-[a-z0-9]+-[0-9a-f]{8}$/.test(String(r || ""));

// Accepts a bare code, lowercase/spaced code, or a ticket URL containing ?t=CODE
export function cleanCode(raw = "") {
  const s = String(raw).trim();
  const m = s.match(/[?&]t=([A-Za-z0-9-]+)/);
  const c = (m ? m[1] : s).toUpperCase().replace(/[^A-Z0-9-]/g, "");
  return /^GB27-[A-Z0-9]{8}$/.test(c) ? c : null;
}

const QR_OPTS = { width: 560, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0B3A2C", light: "#FFFFFF" } };
export const qrDataUrl = (code) => QRCode.toDataURL(code, QR_OPTS);

// ---------- Flutterwave ----------
export async function flwVerifyByRef(txRef) {
  const res = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`, {
    headers: { authorization: `Bearer ${env("FLW_SECRET_KEY")}` },
  });
  const body = await res.json().catch(() => ({}));
  return body.status === "success" && body.data ? { found: true, data: body.data } : { found: false };
}

// ---------- Verify a payment and issue its ticket (safe to call any number of times) ----------
// -> { state:'paid', ticket } | { state:'pending' } | { state:'not_started' } | { state:'failed', reason }
export async function issueTicket(txRef) {
  const row = await kv.get(`t/${txRef}`);
  if (!row) return { state: "failed", reason: "unknown_reference" };
  if (row.status === "paid") {
    const t = await kv.get(`p/${row.code}`);
    if (t && !t.email_sent_at) await sendTicketEmail(t).catch((e) => console.error("Email failed", e));
    return { state: "paid", ticket: t || row };
  }

  const v = await flwVerifyByRef(txRef);
  if (!v.found) return { state: row.status === "failed" ? "failed" : "not_started" };
  const d = v.data;

  if (d.status !== "successful") {
    if (d.status === "failed") {
      await kv.set(`t/${txRef}`, { ...row, status: "failed" });
      return { state: "failed", reason: "payment_failed" };
    }
    return { state: "pending" };
  }

  // Never trust the browser: check the money that actually arrived.
  if (d.tx_ref !== txRef || d.currency !== CURRENCY || Number(d.amount) < Number(row.amount)) {
    console.error("Payment mismatch", { txRef, amount: d.amount, currency: d.currency });
    await kv.set(`t/${txRef}`, { ...row, status: "failed", note: "amount_or_currency_mismatch" });
    return { state: "failed", reason: "amount_mismatch" };
  }

  // One ticket per payment, even if the webhook and the buyer's browser race each other.
  const proposed = newCode();
  const won = await kv.create(`i/${txRef}`, { code: proposed });
  const code = won ? proposed : (await kv.get(`i/${txRef}`)).code;

  const ticket = {
    code, tx_ref: txRef, name: row.name, phone: row.phone, email: row.email,
    amount: Number(d.amount), currency: CURRENCY, payment_type: d.payment_type || null,
    flw_tx_id: d.id, created_at: row.created_at, paid_at: new Date().toISOString(),
  };
  if (won) {
    await kv.set(`p/${code}`, ticket);
    await kv.set(`t/${txRef}`, { ...row, status: "paid", code, paid_at: ticket.paid_at, payment_type: ticket.payment_type });
    await sendTicketEmail(ticket).catch((e) => console.error("Email failed", e));
    return { state: "paid", ticket };
  }
  return { state: "paid", ticket: (await kv.get(`p/${code}`)) || ticket };
}

// ---------- Email (existing Namecheap mailbox) ----------
let _mailer;
const mailer = () =>
  (_mailer ||= nodemailer.createTransport({
    host: "smtp.privateemail.com", port: 465, secure: true,
    auth: { user: env("SMTP_USER", "info@bahatihildasabiti.com"), pass: env("SMTP_PASSWORD") },
  }));

export const escapeHtml = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function sendTicketEmail(t) {
  if (!env("SMTP_PASSWORD")) throw new Error("SMTP_PASSWORD not set");
  const ticketUrl = `${SITE()}/glory-blueprint-2027/ticket/?t=${t.code}`;
  const png = await QRCode.toBuffer(t.code, QR_OPTS);
  const first = escapeHtml((t.name || "").split(" ")[0]);
  const row = (k, v) => `<tr><td style="padding:10px 0;color:#557567;width:110px">${k}</td><td style="padding:10px 0">${v}</td></tr>`;

  const html = `<!doctype html><html><body style="margin:0;background:#F2F7F4;font-family:Helvetica,Arial,sans-serif;color:#0B3A2C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F7F4;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:18px;overflow:hidden">
<tr><td style="background:#0B3A2C;padding:28px 28px 24px;color:#FFFFFF">
<div style="font-size:13px;color:#8FE9CF">${EVENT.host} presents</div>
<div style="font-family:Georgia,serif;font-size:28px;line-height:1.15;margin-top:6px">${EVENT.name}</div></td></tr>
<tr><td style="padding:26px 28px 6px;font-size:16px;line-height:1.55">
<p style="margin:0 0 14px">Hi ${first},</p>
<p style="margin:0 0 14px">Your place is confirmed. Show this QR code at the entrance on the day.</p></td></tr>
<tr><td align="center" style="padding:6px 28px">
<img src="cid:ticketqr" width="240" height="240" alt="Ticket QR code ${t.code}" style="display:block;border:0">
<div style="font-family:Courier,monospace;font-size:18px;letter-spacing:.12em;margin-top:8px">${t.code}</div></td></tr>
<tr><td style="padding:20px 28px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;line-height:1.5;border-top:1px solid #DCEAE3">
${row("Name", escapeHtml(t.name))}${row("Date", EVENT.date)}${row("Time", EVENT.time)}${row("Venue", EVENT.venue)}${row("Paid", `${CURRENCY} ${Number(t.amount).toLocaleString("en-US")}`)}
</table></td></tr>
<tr><td style="padding:10px 28px 26px;font-size:14px;line-height:1.55;color:#33584A">
<p style="margin:0 0 16px">${EVENT.includes}</p>
<p style="margin:0 0 20px"><a href="${ticketUrl}" style="display:inline-block;background:#0FB38E;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:bold">Open my ticket</a></p>
<p style="margin:0">Each ticket admits one person and can be checked in once. Questions? Call or WhatsApp ${EVENT.contactPhone}.</p>
</td></tr></table></td></tr></table></body></html>`;

  await mailer().sendMail({
    from: `"The Glory Blueprint 2027" <${env("SMTP_USER", "info@bahatihildasabiti.com")}>`,
    to: t.email,
    subject: `Your ticket: ${EVENT.name} (${t.code})`,
    html,
    text: `Hi ${(t.name || "").split(" ")[0]},\n\nYour place at ${EVENT.name} is confirmed.\nTicket code: ${t.code}\n${EVENT.date}, ${EVENT.time}, ${EVENT.venue}\n\nOpen your ticket QR code: ${ticketUrl}\n\nQuestions? ${EVENT.contactPhone}`,
    attachments: [{ filename: `${t.code}.png`, content: png, cid: "ticketqr" }],
  });
  await kv.set(`p/${t.code}`, { ...t, email_sent_at: new Date().toISOString() });
}

// ---------- Staff / admin auth ----------
// Check-in: GB_STAFF_PINS="Grace:482913,John:930244" (each person gets a name in the log).
// Admin dashboard: the site's existing ADMIN_PASSWORD (also opens check-in, logged as "Admin").
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const adminOk = (pin) => !!env("ADMIN_PASSWORD") && safeEqual(env("ADMIN_PASSWORD"), pin);

export async function staffFromRequest(req) {
  const pin = req.headers.get("x-pin") || "";
  const hit = env("GB_STAFF_PINS", "").split(",").map((p) => p.split(":").map((s) => s.trim()))
    .find((p) => p.length === 2 && p[1] && safeEqual(p[1], pin));
  if (hit) return hit[0];
  if (adminOk(pin)) return "Admin";
  await sleep(800);
  return null;
}
export async function isAdmin(req) {
  const ok = adminOk(req.headers.get("x-pin") || "");
  if (!ok) await sleep(800);
  return ok;
}

// ---------- Check-in ----------
export async function checkIn(code, staff, method) {
  const t = await kv.get(`p/${code}`);
  if (!t) return { result: "invalid" };
  const rec = { code, used_at: new Date().toISOString(), checked_in_by: staff, checkin_method: method };
  if (await kv.create(`u/${code}`, rec)) return { result: "admitted", ticket: staffView(t, rec) };
  return { result: "already_used", ticket: staffView(t, await kv.get(`u/${code}`)) };
}

export const staffView = (t, u) => ({
  code: t.code, name: t.name, phone: t.phone, email: t.email,
  used_at: u?.used_at || null, checked_in_by: u?.checked_in_by || null,
});

// All paid tickets merged with their check-in records
export async function attendees() {
  const [tickets, used] = await Promise.all([kv.all("p/"), kv.all("u/")]);
  const byCode = Object.fromEntries(used.map((u) => [u.code, u]));
  return tickets.map((t) => ({
    ...t,
    used_at: byCode[t.code]?.used_at || null,
    checked_in_by: byCode[t.code]?.checked_in_by || null,
    checkin_method: byCode[t.code]?.checkin_method || null,
  }));
}
