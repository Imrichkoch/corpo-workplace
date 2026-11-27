import { asset, dayKey, offices, rangesOverlap } from "./data.js";

export function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const validTime = (value) => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const shortText = (value) => typeof value === "string" && value.length <= 100;
export function checkBooking(record, today = dayKey()) {
  if (!record || !asset(record.resource)) return "Vyberte platný priestor.";
  if (!validDate(record.date) || record.date < today) return "Vyberte dnešný alebo neskorší dátum.";
  if (!validTime(record.start) || !validTime(record.end) || record.start >= record.end) return "Čas konca musí byť po čase začiatku.";
  if (!shortText(record.title)) return "Názov môže mať najviac 100 znakov.";
  return "";
}
export function findConflict(bookings, record) {
  return bookings.some((b) => b.resource === record.resource && b.date === record.date && rangesOverlap(b, record));
}
export function checkVisit(record, today = dayKey()) {
  if (!record || !offices.some((o) => o.id === record.office)) return "Vyberte platnú kanceláriu.";
  if (!shortText(record.name) || !record.name.trim()) return "Zadajte meno návštevy.";
  if (!shortText(record.company)) return "Názov firmy môže mať najviac 100 znakov.";
  if (!validDate(record.date) || record.date < today || !validTime(record.time)) return "Vyberte platný dátum a čas.";
  return "";
}
