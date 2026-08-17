// Server-side verification of a Flutterwave transaction.
// Called from the frontend after Flutterwave's inline checkout returns a
// success callback. Never trust that client-side callback alone — a user
// (or a compromised browser) could fake it, so we re-check with
// Flutterwave's API using the SECRET key, which lives only here as an
// environment variable, never in frontend code or in this repo.

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

  const { transaction_id, expected_amount, expected_currency, tx_ref, customer, items } = body;

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

    // Guard against tampering: check the transaction actually succeeded,
    // and that the amount/currency/tx_ref match what we expect to have charged.
    const amountOk =
      typeof expected_amount !== "number" || tx.amount >= expected_amount;
    const currencyOk = !expected_currency || tx.currency === expected_currency;
    const refOk = !tx_ref || tx.tx_ref === tx_ref;
    const statusOk = tx.status === "successful";

    const verified = amountOk && currencyOk && refOk && statusOk;

    if (verified) {
      await sendOrderEmail({ tx, customer, items, tx_ref });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        verified,
        status: tx.status,
        amount: tx.amount,
        currency: tx.currency,
        tx_ref: tx.tx_ref,
        customer: tx.customer,
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

// Sends an order notification to Hilda's team via Resend.
// Failure to send email never blocks the customer's payment confirmation —
// it's a best-effort notification, so errors are only logged.
async function sendOrderEmail({ tx, customer, items, tx_ref }) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error("RESEND_API_KEY is not set — skipping order email");
    return;
  }

  const itemRows = (items || [])
    .map(
      (it) =>
        `<tr><td>${escapeHtml(it.name)}${it.digital ? " (Digital)" : ""}</td><td>${it.qty}</td><td>UGX ${Number(it.price).toLocaleString("en-UG")}</td></tr>`
    )
    .join("");

  const hasPhysical = (items || []).some((it) => !it.digital);

  const html = `
    <h2>New Bookstore Order — ${escapeHtml(tx_ref)}</h2>
    <p><strong>Amount paid:</strong> ${tx.currency} ${Number(tx.amount).toLocaleString("en-UG")}</p>
    <p><strong>Customer:</strong> ${escapeHtml(customer && customer.name)} — ${escapeHtml(customer && customer.email)} — ${escapeHtml(customer && customer.phone)}</p>
    ${hasPhysical ? `<p><strong>Delivery address:</strong><br>${escapeHtml(customer && customer.address).replace(/\n/g, "<br>")}</p>` : ""}
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
      <tr><th>Item</th><th>Qty</th><th>Price</th></tr>
      ${itemRows}
    </table>
    <p style="color:#888;font-size:12px;">Flutterwave transaction ID: ${tx.id}</p>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Bahati Hilda Bookstore <onboarding@resend.dev>",
        to: ["bahatihilda@gmail.com"],
        subject: `New order ${tx_ref}${hasPhysical ? " (physical delivery)" : ""}`,
        html,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("Resend send failed:", res.status, errText);
    }
  } catch (err) {
    console.error("Resend send error:", err);
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
