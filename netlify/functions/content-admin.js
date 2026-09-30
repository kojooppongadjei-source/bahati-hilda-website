// Admin API for the site content panel (/site-admin).
// Protected by the same ADMIN_PASSWORD as the academy registrations view.
// Content lives in Netlify Blobs, so edits go live instantly with no deploy.
//
// POST JSON { action, type, item, id, image }
//   list   -> all items of a type (drafts included)
//   save   -> create or update one item (matched by id)
//   delete -> remove one item by id
//   upload -> store an image (base64 data URL), returns its public URL

const TYPES = ["posts", "testimonials"];

function stores() {
  const { getStore } = require("@netlify/blobs");
  const opts = { siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN };
  return {
    content: getStore({ name: "site-content", ...opts }),
    media: getStore({ name: "site-media", ...opts }),
  };
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

function slugify(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "post";
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return json(500, { error: "Server misconfigured: missing admin password" });
  if ((event.headers["x-admin-password"] || "") !== adminPassword) return json(401, { error: "Incorrect password" });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid request" }); }

  const { action, type } = body;
  const { content, media } = stores();

  try {
    if (action === "upload") {
      const m = /^data:(image\/(jpeg|png|webp));base64,(.+)$/.exec(body.image || "");
      if (!m) return json(400, { error: "Upload a JPG, PNG or WebP image." });
      const buf = Buffer.from(m[3], "base64");
      if (buf.length > 4.5 * 1024 * 1024) return json(400, { error: "Image is too large. Keep it under 4 MB." });
      const ext = m[2] === "jpeg" ? "jpg" : m[2];
      const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      await media.set(key, buf, { metadata: { contentType: m[1] } });
      return json(200, { url: `/.netlify/functions/media?key=${encodeURIComponent(key)}` });
    }

    if (!TYPES.includes(type)) return json(400, { error: "Unknown content type" });
    const items = (await content.get(type, { type: "json" })) || [];

    if (action === "list") return json(200, { items });

    if (action === "save") {
      const item = body.item || {};
      const now = new Date().toISOString();
      if (type === "posts") {
        if (!item.title) return json(400, { error: "Give the post a title." });
        item.slug = slugify(item.slug || item.title);
        const clash = items.find((p) => p.slug === item.slug && p.id !== item.id);
        if (clash) item.slug = `${item.slug}-${Date.now().toString(36).slice(-4)}`;
      } else if (!item.name || !item.quote) {
        return json(400, { error: "A testimonial needs a name and the quote." });
      }
      const i = items.findIndex((x) => x.id && x.id === item.id);
      if (i >= 0) items[i] = { ...items[i], ...item, updatedAt: now };
      else items.unshift({ ...item, id: `${type[0]}_${Date.now().toString(36)}`, createdAt: now, updatedAt: now });
      await content.setJSON(type, items);
      return json(200, { item: i >= 0 ? items[i] : items[0] });
    }

    if (action === "delete") {
      await content.setJSON(type, items.filter((x) => x.id !== body.id));
      return json(200, { ok: true });
    }

    return json(400, { error: "Unknown action" });
  } catch (err) {
    console.error("content-admin error:", err);
    return json(500, { error: "Something went wrong saving. Try again." });
  }
};
