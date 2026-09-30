// Runs automatically on every verified Netlify Forms submission
// (Netlify calls a function named "submission-created" for each one).
// For each form it:
//   1. emails the right team inbox with the details (reply goes straight to the sender)
//   2. sends the sender an automatic "we've received it" reply
// Uses the same Namecheap Private Email account as the academy confirmations,
// so it needs SMTP_PASSWORD set in Netlify environment variables.

const FROM = '"Dr. Bahati Hilda Sabiti" <info@bahatihildasabiti.com>';

const FORMS = {
  "speaking-booking": {
    to: "bookings@bahatihildasabiti.com",
    subject: (d) => `Speaking request: ${d.event_name || "New event"} (${d.organisation || d.name})`,
    labels: {
      name: "Name", organisation: "Organisation", email: "Email", phone: "Phone / WhatsApp",
      event_name: "Event", event_date: "Date", location: "Location", format: "Format",
      topic: "Topic", audience_size: "Audience", budget: "Budget", details: "Details",
    },
    reply: (d) => ({
      subject: "We've received your speaking request",
      html: `
        <p>Hi ${esc(first(d.name))},</p>
        <p>Thank you for inviting Dr. Bahati Hilda Sabiti to speak at <strong>${esc(d.event_name)}</strong>${d.event_date ? ` on <strong>${esc(d.event_date)}</strong>` : ""}.</p>
        <p>Hilda's team will review your request and get back to you within 48 hours to confirm availability, topic and format.</p>
        <p>If your event is very soon, you can also reach us on WhatsApp: <a href="https://wa.me/256757117117">+256 757 117 117</a>.</p>
        <p>Warm regards,<br>The Bahati Hilda Sabiti Team<br><a href="https://bahatihildasabiti.com">bahatihildasabiti.com</a></p>`,
    }),
  },

  contact: {
    to: "info@bahatihildasabiti.com",
    subject: (d) => `Website enquiry: ${d.reason || "General"} (${[d.first_name, d.last_name].filter(Boolean).join(" ")})`,
    labels: {
      first_name: "First name", last_name: "Last name", email: "Email", phone: "Phone / WhatsApp",
      reason: "Reason", message: "Message",
    },
    reply: (d) => ({
      subject: "Thank you for reaching out",
      html: `
        <p>Hi ${esc(d.first_name)},</p>
        <p>Thank you for your message. It has reached Hilda's team, and we'll be in touch within 24 to 48 hours.</p>
        <p>For anything urgent, WhatsApp us on <a href="https://wa.me/256757117117">+256 757 117 117</a>.</p>
        <p>Warm regards,<br>The Bahati Hilda Sabiti Team<br><a href="https://bahatihildasabiti.com">bahatihildasabiti.com</a></p>`,
    }),
  },

  "academy-waitlist": {
    to: "academy@bahatihildasabiti.com",
    subject: (d) => `Academy waitlist: ${d.name}`,
    labels: {
      name: "Name", email: "Email", phone: "WhatsApp", focus: "Wants help with", source: "Heard about us via",
    },
    reply: (d) => ({
      subject: "You're on the Academy waitlist",
      html: `
        <p>Hi ${esc(first(d.name))},</p>
        <p>You're on the waitlist for the next cohort of the Accelerated Mentorship Academy with Dr. Bahati Hilda Sabiti.</p>
        <p>We'll message you by email and WhatsApp as soon as the next cohort's dates and fees are set, before they're announced publicly.</p>
        <p>Questions before then? WhatsApp the academy team on <a href="https://wa.me/256757117117">+256 757 117 117</a>.</p>
        <p>Warm regards,<br>Accelerated Mentorship Academy<br><a href="https://bahatihildasabiti.com">bahatihildasabiti.com</a></p>`,
    }),
  },
};

function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function first(name) {
  return String(name || "").trim().split(/\s+/)[0] || "there";
}

function getTransporter() {
  const nodemailer = require("nodemailer");
  return nodemailer.createTransport({
    host: "smtp.privateemail.com",
    port: 465,
    secure: true,
    auth: { user: "info@bahatihildasabiti.com", pass: process.env.SMTP_PASSWORD },
  });
}

exports.handler = async (event) => {
  let payload;
  try {
    payload = JSON.parse(event.body).payload;
  } catch (e) {
    console.error("submission-created: could not parse body", e);
    return { statusCode: 200, body: "ignored" };
  }

  const form = FORMS[payload.form_name];
  if (!form) return { statusCode: 200, body: "no handler for this form" };

  if (!process.env.SMTP_PASSWORD) {
    console.error("SMTP_PASSWORD is not set; skipping emails for", payload.form_name);
    return { statusCode: 200, body: "smtp not configured" };
  }

  const d = payload.data || {};
  const transporter = getTransporter();

  const rows = Object.keys(form.labels)
    .filter((k) => d[k])
    .map((k) => `<tr><td style="padding:6px 14px 6px 0;color:#666;vertical-align:top;">${form.labels[k]}</td><td style="padding:6px 0;">${esc(d[k]).replace(/\n/g, "<br>")}</td></tr>`)
    .join("");

  const jobs = [
    transporter.sendMail({
      from: FROM,
      to: form.to,
      replyTo: d.email || undefined,
      subject: form.subject(d),
      html: `<p>New submission from the website. Reply to this email to answer them directly.</p><table>${rows}</table>`,
    }),
  ];

  if (d.email) {
    const r = form.reply(d);
    jobs.push(transporter.sendMail({ from: FROM, to: d.email, replyTo: form.to, subject: r.subject, html: r.html }));
  }

  const results = await Promise.allSettled(jobs);
  results.forEach((res) => {
    if (res.status === "rejected") console.error("submission-created email failed:", res.reason);
  });

  return { statusCode: 200, body: "ok" };
};
