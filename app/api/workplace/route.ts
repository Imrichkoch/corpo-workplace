import { env } from "cloudflare:workers";
import { getChatGPTUser, type ChatGPTUser } from "../../chatgpt-auth";
import { checkBooking, checkVisit } from "../../../public/workspace/validation.js";

export const dynamic = "force-dynamic";
const conflict = "Priestor je v tomto čase rezervovaný.";
const failure = (message: string, status: number) => Response.json({ message }, { status });
type Booking = { id: string; resource: string; date: string; start: string; end: string; title: string; mine: number };
type Visit = { id: string; name: string; company: string; date: string; time: string; office: string; status: string };
type Snapshot = {
  profile: { name: string; email: string; demo: false };
  bookings: (Omit<Booking, "mine"> & { mine: boolean })[];
  visits: Visit[];
  attendeeCount: Record<string, Record<string, number>>;
};

async function snapshot(db: D1Database, user: ChatGPTUser) {
  const [bookingResult, visitResult, attendeeResult] = await db.batch([
    db.prepare("SELECT id, resource, date, start, end, CASE WHEN owner = ? THEN title ELSE '' END AS title, owner = ? AS mine FROM bookings ORDER BY date,start").bind(user.userId, user.userId),
    db.prepare("SELECT id,name,company,date,time,office,status FROM visits WHERE owner = ? ORDER BY date,time").bind(user.userId),
    db.prepare("SELECT date, CASE WHEN resource LIKE 'kosice-%' OR resource IN ('hornad','k2') THEN 'kosice' ELSE 'bratislava' END AS office, count(DISTINCT owner) AS count FROM bookings GROUP BY date,office"),
  ]);
  const attendeeCount: Snapshot["attendeeCount"] = {};
  for (const row of attendeeResult.results as { date: string; office: string; count: number }[]) {
    (attendeeCount[row.date] ??= {})[row.office] = row.count;
  }
  const result: Snapshot = {
    profile: { name: user.displayName, email: user.email, demo: false },
    bookings: (bookingResult.results as Booking[]).map((b) => ({ ...b, mine: !!b.mine })),
    visits: visitResult.results as Visit[],
    attendeeCount,
  };
  return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return failure("Prihláste sa do pracoviska.", 401);
  if (!env.DB) return failure("Databáza pracoviska je nedostupná.", 503);
  return snapshot(env.DB, user);
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return failure("Prihláste sa do pracoviska.", 401);
  const db = env.DB;
  if (!db) return failure("Databáza pracoviska je nedostupná.", 503);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return failure("Neplatný formát požiadavky.", 415);
  let input;
  try { input = await request.json(); } catch { return failure("Neplatná požiadavka.", 400); }
  if (!input || typeof input !== "object" || !("action" in input) || !("record" in input) ||
      !input.record || typeof input.record !== "object" || Array.isArray(input.record)) return failure("Neplatná požiadavka.", 400);
  const record = input.record as Record<string, string>;
  const { id, status } = record;
  switch (input.action) {
    case "create-booking": {
      const error = checkBooking(record);
      if (error) return failure(error, 400);
      const { resource, date, start, end, title } = record;
      const result = await db.prepare(
        "INSERT INTO bookings (id,owner,resource,date,start,end,title) SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE resource=? AND date=? AND start<? AND end>?)"
      ).bind(crypto.randomUUID(), user.userId, resource, date, start, end, title.trim(), resource, date, end, start).run();
      if (result.meta.changes === 0) return failure(conflict, 409);
      break;
    }
    case "cancel-booking": {
      const result = await db.prepare("DELETE FROM bookings WHERE id=? AND owner=?").bind(String(id ?? ""), user.userId).run();
      if (result.meta.changes === 0) return failure("Rezervácia už nie je k dispozícii.", 404);
      break;
    }
    case "create-visit": {
      const error = checkVisit(record);
      if (error) return failure(error, 400);
      const { name, company, date, time, office } = record;
      await db.prepare("INSERT INTO visits (id,owner,name,company,date,time,office) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), user.userId, name.trim(), company.trim(), date, time, office).run();
      break;
    }
    case "next-visit": {
      if (status !== "expected" && status !== "arrived") return failure("Neplatný stav návštevy.", 400);
      const next = status === "expected" ? "arrived" : "departed";
      const result = await db.prepare("UPDATE visits SET status=? WHERE id=? AND owner=? AND status=?")
        .bind(next, String(id ?? ""), user.userId, status).run();
      if (result.meta.changes === 0) return failure("Stav návštevy sa medzitým zmenil.", 409);
      break;
    }
    case "delete-visit": {
      const result = await db.prepare("DELETE FROM visits WHERE id=? AND owner=?").bind(String(id ?? ""), user.userId).run();
      if (result.meta.changes === 0) return failure("Návšteva už nie je k dispozícii.", 404);
      break;
    }
    default:
      return failure("Neznáma akcia.", 400);
  }
  return snapshot(db, user);
}
