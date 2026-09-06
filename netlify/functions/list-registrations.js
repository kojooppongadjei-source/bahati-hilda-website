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

  try {
    const { getStore } = require("@netlify/blobs");
    const store = getStore("academy-registrations");
    const { blobs } = await store.list();

    const records = await Promise.all(
      blobs.map(async (b) => {
        const record = await store.get(b.key, { type: "json" });
        return record;
      })
    );

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
