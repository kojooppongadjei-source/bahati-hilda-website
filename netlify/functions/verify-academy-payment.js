// Server-side verification of a Flutterwave transaction for the
// Accelerated Mentorship Academy — Package Yourself Like an Expert:
// The 7 Power Systems registration.
//
// Mirrors the pattern in verify-payment.js (bookstore), but kept as its
// own function so registration emails and content stay separate from
// bookstore order emails. Never trusts the client-side Flutterwave
// callback alone — always re-checks with Flutterwave's API using the
// secret key, which lives only in Netlify environment variables.

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { transaction_id, tx_ref, student } = body;
  const requestedPlan = ["full", "installment", "balance"].includes(body.plan) ? body.plan : "full";

  try { connectLambda(event); } catch (e) { /* older runtime: token fallback below */ }

  if (!transaction_id) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "transaction_id is required" }),
    };
  }

  const secretKey = process.env.FLW_SECRET_KEY;
  if (!secretKey) {
    console.error("FLW_SECRET_KEY is not set in Netlify environment variables");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server misconfigured: missing secret key" }),
    };
  }

  try {
    const res = await fetch(
      `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transaction_id)}/verify`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      }
    );

    const data = await res.json();

    if (data.status !== "success" || !data.data) {
      return {
        statusCode: 400,
        body: JSON.stringify({ verified: false, reason: "Verification call failed" }),
      };
    }

    const tx = data.data;

    // The price is decided here, never by the browser: the amount actually
    // paid decides which plan this payment counts as.
    const plan = classifyPlan(requestedPlan, tx);
    const amountOk = plan !== null;
    const currencyOk = true; // checked inside price.accepts
    const refOk = !tx_ref || tx.tx_ref === tx_ref;
    const statusOk = tx.status === "successful";
    if (!amountOk) console.error("Academy payment below required price", { tx_ref: tx.tx_ref, amount: tx.amount, currency: tx.currency });

    const verified = amountOk && currencyOk && refOk && statusOk;

    if (verified) {
      await saveRegistration({ tx, student, tx_ref, plan });
      await sendStudentConfirmationEmail({ tx, student, tx_ref, plan });
      await sendTeamNotificationEmail({ tx, student, tx_ref, plan });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        verified,
        status: tx.status,
        amount: tx.amount,
        currency: tx.currency,
        tx_ref: tx.tx_ref,
      }),
    };
  } catch (err) {
    console.error("Verification error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Verification request failed" }),
    };
  }
};

// ---- Price schedule: Package Yourself Like an Expert, December 2026 intake ----
// UGX 3,000,000 until 31 December 2026 (Kampala time). From 1 January 2027
// the investment is USD 1,000 (or the UGX amount in ACADEMY_JAN_PRICE_UGX,
// if the team sets one in Netlify).
const PRICE_CHANGE_AT = Date.parse("2027-01-01T00:00:00+03:00");
function requiredPrice(createdAt) {
  const at = Date.parse(createdAt) || Date.now();
  if (at < PRICE_CHANGE_AT) {
    return { label: "UGX 3,000,000", accepts: (cur, amt) => cur === "UGX" && amt >= 3000000 };
  }
  const janUgx = parseInt(process.env.ACADEMY_JAN_PRICE_UGX || "0", 10);
  return {
    label: "USD 1,000",
    accepts: (cur, amt) => (cur === "USD" && amt >= 1000) || (janUgx > 0 && cur === "UGX" && amt >= janUgx),
  };
}

// Two-part plan (early price only): 2 x UGX 1,500,000, 2nd by 11 January 2027.
const INSTALMENT_UGX = 1500000;
const BALANCE_DUE = "2027-01-11";
const BALANCE_DUE_LABEL = "11 January 2027";
const BALANCE_URL = "https://bahatihildasabiti.com/academy-balance";

// Returns "full" | "installment" | "balance", or null if the amount paid
// doesn't cover what was asked for.
function classifyPlan(requested, tx) {
  const amt = Number(tx.amount), cur = tx.currency;
  const early = (Date.parse(tx.created_at) || Date.now()) < PRICE_CHANGE_AT;
  if (requested === "balance") return cur === "UGX" && amt >= INSTALMENT_UGX ? "balance" : null;
  if (requiredPrice(tx.created_at).accepts(cur, amt)) return "full";
  if (requested === "installment" && early && cur === "UGX" && amt >= INSTALMENT_UGX) return "installment";
  return null;
}

const PLAN_LABELS = {
  full: "Full Payment",
  installment: "Two-Part Plan: Instalment 1 of 2",
  balance: "Two-Part Plan: Instalment 2 of 2",
};

const { getStore, connectLambda } = require("@netlify/blobs");

// Netlify's built-in Blobs access first (no token to expire), then the
// site's NETLIFY_SITE_ID + NETLIFY_BLOBS_TOKEN as a fallback.
async function withBlobStore(fn) {
  const routes = [
    () => getStore({ name: "academy-registrations" }),
    () => getStore({ name: "academy-registrations", siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN }),
  ];
  let lastErr;
  for (const make of routes) {
    try { return await fn(make()); } catch (e) { lastErr = e; console.error("Blobs route failed:", e && e.message); }
  }
  throw lastErr;
}

// Persists each verified registration to Netlify Blobs, so Hilda's team
// can view registrations, payment status, and lead source from a simple
// admin page instead of only reading through emails. Keyed by tx_ref so
// each payment (including a student's 2nd instalment, paid separately)
// gets its own record.
async function saveRegistration({ tx, student, tx_ref, plan }) {
  try {
    const record = {
      tx_ref,
      name: student && student.name,
      email: student && student.email,
      phone: student && student.phone,
      source: (student && student.source) || "Not specified",
      plan,
      plan_label: PLAN_LABELS[plan],
      program: "Package Yourself Like an Expert — December 2026 intake (12 weeks, online)",
      amount: tx.amount,
      currency: tx.currency,
      status: tx.status,
      balance_owed: plan === "installment" ? INSTALMENT_UGX : 0,
      balance_due_date: plan === "installment" ? BALANCE_DUE : null,
      flw_transaction_id: tx.id,
      registered_at: new Date().toISOString(),
    };

    await withBlobStore(async (store) => {
      if (plan === "balance") {
        // Clear the balance on this student's 1st-instalment record.
        const first = await findOpenInstalment(store, student, (student && student.reference) || "");
        if (first) {
          await store.setJSON(first.tx_ref, {
            ...first,
            balance_owed: 0,
            balance_paid_at: record.registered_at,
            balance_tx_ref: tx_ref,
          });
          record.first_instalment_tx_ref = first.tx_ref;
        } else {
          record.note = "No matching 1st-instalment record found: check by name/phone.";
        }
      }
      // Re-verifying the same payment must not create a second record.
      const existing = await store.get(tx_ref, { type: "json" });
      if (!existing) await store.setJSON(tx_ref, record);
    });
  } catch (err) {
    // Never block the student's confirmation over a storage hiccup —
    // the email notification is still sent as a fallback record.
    console.error("Failed to save registration to Blobs:", err);
  }
}

const digits = (p) => String(p || "").replace(/\D/g, "").replace(/^(256|0)/, "");

async function findOpenInstalment(store, student, reference) {
  const { blobs } = await store.list();
  const records = (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean);
  const open = records.filter((r) => r.plan === "installment" && r.balance_owed > 0);
  const ref = String(reference).trim().toUpperCase();
  const email = String((student && student.email) || "").trim().toLowerCase();
  const phone = digits(student && student.phone);
  return (
    (ref && open.find((r) => String(r.tx_ref).toUpperCase() === ref)) ||
    (email && open.find((r) => String(r.email || "").trim().toLowerCase() === email)) ||
    (phone.length >= 7 && open.find((r) => digits(r.phone) === phone)) ||
    null
  );
}

function getTransporter() {
  const nodemailer = require("nodemailer");
  return nodemailer.createTransport({
    host: "smtp.privateemail.com",
    port: 465,
    secure: true,
    auth: {
      user: "info@bahatihildasabiti.com",
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

// Sends the student their registration confirmation and onboarding
// instructions. Best-effort: a failure here never blocks the payment
// confirmation the student already saw on-screen.
async function sendStudentConfirmationEmail({ tx, student, tx_ref, plan }) {
  const smtpPassword = process.env.SMTP_PASSWORD;
  if (!smtpPassword || !student || !student.email) {
    if (!smtpPassword) console.error("SMTP_PASSWORD is not set — skipping student confirmation email");
    return;
  }

  const paid = `${tx.currency} ${Number(tx.amount).toLocaleString("en-US")}`;
  const isBalance = plan === "balance";
  const intro = isBalance
    ? `<p>Thank you. Your <strong>2nd and final instalment</strong> for <strong>Package Yourself Like an Expert</strong> has been received. Your program fee is now paid in full.</p>`
    : `<p>Thank you for registering for <strong>Package Yourself Like an Expert</strong>, the 12-week online program of the Accelerated Mentorship Academy. Your place in the intake starting <strong>14 December 2026</strong> is confirmed.</p>`;
  const balanceBlock = plan === "installment"
    ? `<p style="background:#FBF3F1;padding:14px 16px;border-radius:8px;"><strong>Your 2nd instalment of UGX 1,500,000 is due by ${BALANCE_DUE_LABEL}.</strong><br>
       Pay it any time here: <a href="${BALANCE_URL}?ref=${encodeURIComponent(tx_ref)}">${BALANCE_URL}</a></p>`
    : "";

  const html = `
    <h2>${isBalance ? "Payment Received" : "You're Registered"} — Package Yourself Like an Expert</h2>
    <p>Hi ${escapeHtml(student.name)},</p>
    ${intro}
    <p><strong>Payment received:</strong> ${escapeHtml(PLAN_LABELS[plan])} (${escapeHtml(paid)})<br>
    <strong>Reference:</strong> ${escapeHtml(tx_ref)}<br>
    <strong>Transaction ID:</strong> ${tx.id}</p>
    ${balanceBlock}
    ${isBalance ? "" : `<h3>What happens next</h3>
    <ul>
      <li>You'll receive a separate onboarding email from our team within 24 hours with your class schedule, learning materials and access details.</li>
      <li>The program is fully online and runs for 12 weeks, starting <strong>14 December 2026</strong>.</li>
      <li>If you have any questions in the meantime, WhatsApp us at <a href="https://wa.me/256757117117">+256 757 117 117</a> or reply to this email.</li>
    </ul>
    <p>We're excited to have you in the room.</p>`}
    <p>— The Accelerated Mentorship Academy Team</p>
  `;

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: '"Accelerated Mentorship Academy" <info@bahatihildasabiti.com>',
      to: student.email,
      subject: isBalance
        ? "Payment received: your 2nd instalment, Package Yourself Like an Expert"
        : "You're Registered: Package Yourself Like an Expert (starts 14 December)",
      html,
    });
  } catch (err) {
    console.error("Student confirmation email error:", err);
  }
}

// Notifies Hilda's team of the new registration. In the absence of a
// dedicated database, this email is the student record: it captures
// every field needed to track who registered, which plan, and what's
// still owed.
async function sendTeamNotificationEmail({ tx, student, tx_ref, plan }) {
  const smtpPassword = process.env.SMTP_PASSWORD;
  if (!smtpPassword) {
    console.error("SMTP_PASSWORD is not set — skipping team notification email");
    return;
  }

  const planLabel = PLAN_LABELS[plan];
  const balanceNote = plan === "installment"
    ? `<p style="color:#9C6169;"><strong>Balance owed:</strong> UGX 1,500,000, due by ${BALANCE_DUE_LABEL}.</p>`
    : plan === "balance"
      ? `<p><strong>2nd instalment received.</strong> This student has now paid in full.${student && student.reference ? ` 1st payment reference given: ${escapeHtml(student.reference)}` : ""}</p>`
      : `<p><strong>Balance owed:</strong> None — paid in full.</p>`;

  const html = `
    <h2>New Academy Registration — Package Yourself Like an Expert (December 2026 intake)</h2>
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
      <tr><td><strong>Name</strong></td><td>${escapeHtml(student && student.name)}</td></tr>
      <tr><td><strong>Email</strong></td><td>${escapeHtml(student && student.email)}</td></tr>
      <tr><td><strong>Phone</strong></td><td>${escapeHtml(student && student.phone)}</td></tr>
      <tr><td><strong>Heard about us via</strong></td><td>${escapeHtml((student && student.source) || "Not specified")}</td></tr>
      <tr><td><strong>Plan</strong></td><td>${escapeHtml(planLabel)}</td></tr>
      <tr><td><strong>Amount paid today</strong></td><td>${tx.currency} ${Number(tx.amount).toLocaleString("en-UG")}</td></tr>
      <tr><td><strong>Reference</strong></td><td>${escapeHtml(tx_ref)}</td></tr>
      <tr><td><strong>Flutterwave transaction ID</strong></td><td>${tx.id}</td></tr>
      <tr><td><strong>Registered at</strong></td><td>${new Date().toISOString()}</td></tr>
    </table>
    ${balanceNote}
    <p style="color:#888;font-size:12px;">Add this student to the program roster and onboarding list.</p>
  `;

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: '"Academy Registrations" <info@bahatihildasabiti.com>',
      to: "academy@bahatihildasabiti.com",
      subject: `New Registration: ${student && student.name} — ${planLabel} (${tx_ref})`,
      html,
    });
  } catch (err) {
    console.error("Team notification email error:", err);
  }
}

function escapeHtml(str) {
  if (str === undefined || str === null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
