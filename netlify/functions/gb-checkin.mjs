// POST /api/gb/checkin  (header x-pin)
//   login | scan {code} | checkin {code} | search {q} | stats
import { json, fail, kv, cleanCode, staffFromRequest, checkIn, attendees, staffView } from "../lib/gb.mjs";

export default async (req) => {
  if (req.method !== "POST") return fail("Method not allowed", 405);
  const staff = await staffFromRequest(req);
  if (!staff) return fail("Wrong PIN.", 401);
  const body = await req.json().catch(() => ({}));

  switch (body.action) {
    case "login":
      return json({ staff });
    case "scan":
    case "checkin": {
      const code = cleanCode(body.code);
      if (!code) return json({ result: "invalid" });
      return json(await checkIn(code, staff, body.action === "scan" ? "qr" : "manual"));
    }
    case "search": {
      const q = String(body.q || "").trim().toLowerCase();
      if (q.length < 2) return json({ results: [] });
      let digits = q.replace(/\D/g, "");
      if (digits.startsWith("0")) digits = digits.slice(1); // 0772... matches 256772...
      const list = (await attendees()).filter((t) =>
        t.name.toLowerCase().includes(q) || t.email.includes(q) || t.code.toLowerCase().includes(q) ||
        (digits.length >= 4 && t.phone.includes(digits)));
      list.sort((a, b) => a.name.localeCompare(b.name));
      return json({ results: list.slice(0, 25).map((t) => staffView(t, t)) });
    }
    case "stats": {
      const [sold, checked_in] = await Promise.all([kv.count("p/"), kv.count("u/")]);
      return json({ sold, checked_in });
    }
    default:
      return fail("Unknown action.");
  }
};
export const config = { path: "/api/gb/checkin" };
