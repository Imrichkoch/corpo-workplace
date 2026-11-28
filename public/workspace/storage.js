import { t } from "./i18n.js";
import { dayKey, sampleData } from "./data.js";
import { checkBooking, checkVisit, findConflict } from "./validation.js";

const demoKey = "corpo:demo:v1";
const endpoint = "/api/workplace";
export function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
export function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Browser storage can be disabled. */ }
}
export function makeStorage(hosted) {
  if (hosted) {
    const send = async (body) => {
      const response = await fetch(endpoint, body ? {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      } : { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error(data?.message || t("Pracovisko je momentálne nedostupné."));
      return data;
    };
    return { load: () => send(), update: (action, record) => send({ action, record }) };
  }
  let memory = readLocal(demoKey, null) || sampleData(dayKey());
  const sync = () => readLocal(demoKey, memory);
  const update = async (action, record) => {
    const data = sync();
    const { bookings, visits } = data;
    switch (action) {
      case "create-booking": {
        const error = checkBooking(record);
        if (error) throw new Error(error);
        if (findConflict(bookings, record)) throw new Error(t("Priestor je v tomto čase rezervovaný."));
        bookings.push({ ...record, id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()), mine: true, person: data.profile.name });
        break;
      }
      case "cancel-booking":
        data.bookings = bookings.filter((b) => b.id !== record.id || !b.mine);
        break;
      case "create-visit": {
        const error = checkVisit(record);
        if (error) throw new Error(error);
        visits.push({ ...record, id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()), status: "expected" });
        break;
      }
      case "next-visit": {
        const visit = visits.find((v) => v.id === record.id);
        if (!visit || visit.status !== record.status || visit.status === "departed") throw new Error(t("Stav návštevy sa medzitým zmenil."));
        visit.status = visit.status === "expected" ? "arrived" : "departed";
        break;
      }
      case "delete-visit":
        data.visits = visits.filter((v) => v.id !== record.id);
        break;
      default:
        throw new Error(t("Neznáma akcia."));
    }
    memory = data;
    writeLocal(demoKey, data);
    return data;
  };
  return { load: async () => sync(), update };
}
