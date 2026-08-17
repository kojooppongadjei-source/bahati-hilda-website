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

  const { transaction_id, expected_amount, expected_currency, tx_ref } = body;

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
