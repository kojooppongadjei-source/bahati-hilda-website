// Serves images uploaded through the site content panel.
exports.handler = async (event) => {
  const key = (event.queryStringParameters || {}).key || "";
  if (!/^[\w.-]+$/.test(key)) return { statusCode: 400, body: "Bad key" };
  try {
    const { getStore } = require("@netlify/blobs");
    const store = getStore({ name: "site-media", siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN });
    const res = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!res) return { statusCode: 404, body: "Not found" };
    return {
      statusCode: 200,
      headers: {
        "Content-Type": (res.metadata && res.metadata.contentType) || "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
      body: Buffer.from(res.data).toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error("media error:", err);
    return { statusCode: 500, body: "Error" };
  }
};
