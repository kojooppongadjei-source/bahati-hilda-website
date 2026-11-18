// Returns all stored academy registrations for the admin view.
// Protected by a shared password (set as ADMIN_PASSWORD in Netlify's
// environment variables) — this is intentionally simple rather than a
// full login system, since it's a single internal viewer for Hilda's team.

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error("ADMIN_PASSWORD is not set in Netlify environment variables");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server misconfigured: missing admin password" }),
    };
  }

  const providedPassword = event.headers["x-admin-password"] || "";
  if (providedPassword !== adminPassword) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "Incorrect password" }),
    };
  }

  const { getStore, connectLambda } = require("@netlify/blobs");
  try { connectLambda(event); } catch (e) { /* token fallback below */ }

  // Built-in Blobs access first, then the site token as a fallback.
  async function readAll(store) {
    const { blobs } = await store.list();
    return Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  }

  try {
    let records, lastErr;
    for (const make of [
      () => getStore({ name: "academy-registrations" }),
      () => getStore({ name: "academy-registrations", siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN }),
    ]) {
      try { records = await readAll(make()); break; } catch (e) { lastErr = e; console.error("Blobs route failed:", e && e.message); }
    }
    if (!records) throw lastErr;
    records = records.filter(Boolean);

    // Most recent first.
    records.sort((a, b) => new Date(b.registered_at) - new Date(a.registered_at));

    return {
      statusCode: 200,
      body: JSON.stringify({ registrations: records }),
    };
  } catch (err) {
    console.error("Failed to list registrations:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to load registrations" }),
    };
  }
};
