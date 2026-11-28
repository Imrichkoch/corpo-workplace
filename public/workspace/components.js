import { t } from "./i18n.js";
import { icon } from "./icons.js";
import { asset, formatDate, initials } from "./data.js";

const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => entities[char]);
export const button = (label, action, symbol, style = "secondary", attrs = "") =>
  '<button type="button" class="button ' + style + '" data-action="' + action + '" ' + attrs + '>' +
  (symbol ? icon(symbol, 17) : "") + esc(label) + '</button>';
export const iconButton = (label, action, symbol, attrs = "") =>
  '<button type="button" class="icon-button" aria-label="' + esc(label) + '" title="' + esc(label) + '" data-action="' + action + '" ' + attrs + '>' + icon(symbol, 18) + '</button>';
export const nav = (label, target, style = "text-button") =>
  '<a class="' + style + '" href="#' + target + '" data-route="' + target + '">' + esc(label) + "</a>";
export function pageHeader(title, subtitle, action = "") {
  return '<header class="page-heading"><div><h1>' + esc(title) + '</h1><p>' + esc(subtitle) + '</p></div>' + action + '</header>';
}
export function emptyState(symbol, title, description, action = "") {
  return '<div class="empty"><span class="tile mint">' + icon(symbol, 22) + '</span><strong>' + esc(title) + '</strong><p>' + esc(description) + '</p>' + action + '</div>';
}
export function avatar(name, color = "mint") {
  return '<span class="avatar ' + color + '" aria-hidden="true">' + esc(initials(name)) + '</span>';
}
export function bookingRows(items, today, { cancellable = false } = {}) {
  if (!items.length) return emptyState("calendar", t("Žiadne rezervácie"), t("Rezervujte si stôl alebo zasadačku."), button(t("Nová rezervácia"), "new-booking", "plus"));
  return '<ul class="booking-list">' + items.map((item) => {
    const r = asset(item.resource);
    if (!r) return "";
    const day = item.date === today ? t("Dnes") : formatDate(item.date, { day: "numeric", month: "short" });
    const subtitle = [r.name, t(r.floor)].join(" · ");
    return '<li class="booking-row"><span class="tile ' + (r.type === "desk" ? "sky" : "mint") + '">' + icon(r.type === "desk" ? "desk" : "rooms", 19) + '</span><div class="row-copy"><strong>' + esc((item.id.startsWith("sample-") ? t(item.title) : item.title) || (r.type === "desk" ? t("Pracovný stôl") : t("Zasadačka ") + r.name)) + '</strong><span>' + esc(subtitle) + '</span></div><div class="booking-time"><strong>' + esc(day) + '</strong><span>' + esc(item.start + " – " + item.end) + '</span></div>' + (cancellable ? iconButton(t("Zrušiť rezerváciu"), "cancel-booking", "close", 'data-id="' + esc(item.id) + '"') : "") + "</li>";
  }).join("") + "</ul>";
}
