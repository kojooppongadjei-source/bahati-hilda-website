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

  const { transaction_id, expected_amount, expected_currency, tx_ref, plan, student } = body;

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
      `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
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
        body: JSON.stringify({ verified: false, reason: "Verification call failed", data }),
      };
    }

    const tx = data.data;

    const amountOk =
      typeof expected_amount !== "number" || tx.amount >= expected_amount;
    const currencyOk = !expected_currency || tx.currency === expected_currency;
    const refOk = !tx_ref || tx.tx_ref === tx_ref;
    const statusOk = tx.status === "successful";

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

function getBlobStore() {
  const { getStore } = require("@netlify/blobs");
  // Zero-config getStore() relies on Netlify auto-injecting connection
  // details into the function runtime, which isn't happening reliably
  // for this project — so we configure it explicitly instead using a
  // Personal Access Token (kept as a secret env var) and the site ID.
  return getStore({
    name: "academy-registrations",
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN,
  });
}

// Persists each verified registration to Netlify Blobs, so Hilda's team
// can view registrations, payment status, and lead source from a simple
// admin page instead of only reading through emails. Keyed by tx_ref so
// each payment (including a student's 2nd instalment, paid separately)
// gets its own record.
async function saveRegistration({ tx, student, tx_ref, plan }) {
  try {
    const store = getBlobStore();
    const record = {
      tx_ref,
      name: student && student.name,
      email: student && student.email,
      phone: student && student.phone,
      source: (student && student.source) || "Not specified",
      plan,
      plan_label: plan === "installment" ? "Two-Part Payment Plan (1st instalment)" : "Full Payment",
      amount: tx.amount,
      currency: tx.currency,
      status: tx.status,
      balance_owed: plan === "installment" ? 1250000 : 0,
      balance_due_date: plan === "installment" ? "2026-10-29" : null,
      flw_transaction_id: tx.id,
      registered_at: new Date().toISOString(),
    };
    await store.setJSON(tx_ref, record);
  } catch (err) {
    // Never block the student's confirmation over a storage hiccup —
    // the email notification is still sent as a fallback record.
    console.error("Failed to save registration to Blobs:", err);
  }
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

  const isInstallment = plan === "installment";
  const paidLabel = isInstallment ? "1st of 2 instalments (UGX 1,250,000)" : "Full payment (UGX 2,500,000)";

  const html = `
    <h2>You're Registered — Package Yourself Like an Expert: The 7 Power Systems</h2>
    <p>Hi ${escapeHtml(student.name)},</p>
    <p>Thank you for registering for <strong>Package Yourself Like an Expert: The 7 Power Systems</strong>, the flagship 8-week program of the Accelerated Mentorship Academy. Your seat in the <strong>1st October</strong> cohort is confirmed.</p>
    <p><strong>Payment received:</strong> ${escapeHtml(paidLabel)}<br>
    <strong>Reference:</strong> ${escapeHtml(tx_ref)}<br>
    <strong>Transaction ID:</strong> ${tx.id}</p>
    ${isInstallment ? `<p><strong>Your 2nd instalment</strong> of UGX 1,250,000 is due by <strong>29th October</strong>. We'll send a reminder with a payment link closer to the date.</p>` : ""}
    <h3>What happens next</h3>
    <ul>
      <li>You'll receive a separate onboarding email from our team within 24 hours with your class schedule, learning materials and access details.</li>
      <li>The program runs for 8 weeks starting <strong>1st October</strong>.</li>
      <li>If you have any questions in the meantime, WhatsApp us at <a href="https://wa.me/256757117117">+256 757 117 117</a> or reply to this email.</li>
    </ul>
    <p>We're excited to have you in the room.</p>
    <p>— The Accelerated Mentorship Academy Team</p>
  `;

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: '"Accelerated Mentorship Academy" <info@bahatihildasabiti.com>',
      to: student.email,
      subject: "You're Registered: Package Yourself Like an Expert (7 Power Systems)",
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

  const isInstallment = plan === "installment";
  const planLabel = isInstallment
    ? "Two-Part Payment Plan (1st of 2 instalments paid)"
    : "Full Payment";
  const balanceNote = isInstallment
    ? `<p style="color:#9C6169;"><strong>Balance owed:</strong> UGX 1,250,000, due by 29th October.</p>`
    : `<p><strong>Balance owed:</strong> None — paid in full.</p>`;

  const html = `
    <h2>New Academy Registration — 7 Power Systems</h2>
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
