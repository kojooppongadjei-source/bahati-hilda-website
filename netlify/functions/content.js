// Public read API for site content: published blog posts and testimonials.
// GET ?type=posts            -> published posts, newest first (no body)
// GET ?type=posts&slug=x     -> one published post with its body
// GET ?type=testimonials     -> published testimonials

exports.handler = async (event) => {
  const { type, slug } = event.queryStringParameters || {};
  if (!["posts", "testimonials"].includes(type)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Unknown type" }) };
  }
  const headers = { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" };
  try {
    const { getStore } = require("@netlify/blobs");
    const store = getStore({ name: "site-content", siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN });
    const items = ((await store.get(type, { type: "json" })) || []).filter((x) => x.published);

    if (type === "posts") {
      items.sort((a, b) => String(b.date || b.createdAt).localeCompare(String(a.date || a.createdAt)));
      if (slug) {
        const post = items.find((p) => p.slug === slug);
        return post
          ? { statusCode: 200, headers, body: JSON.stringify({ item: post }) }
          : { statusCode: 404, headers, body: JSON.stringify({ error: "Not found" }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ items: items.map(({ body, ...rest }) => rest) }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ items }) };
  } catch (err) {
    console.error("content error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Could not load content" }) };
  }
};
