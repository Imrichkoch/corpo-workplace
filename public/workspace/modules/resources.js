import { t } from "../i18n.js";
import { formatDate } from "../data.js";
import { icon } from "../icons.js";
import { button, emptyState, esc, pageHeader } from "../components.js";

function resourceCard(resource, bookings) {
  const busy = bookings.some((b) => b.start === "00:00" && b.end === "23:59");
  const status = busy ? t("Obsadené") : bookings.length ? t("Čiastočne voľné") : t("Voľné");
  const desk = resource.type === "desk";
  const geo = desk ? resource.zone : resource.capacity + t(" osôb");
  const occupiedHours = bookings.sort((a, b) => a.start.localeCompare(b.start)).map((b) => b.start + "–" + b.end);
  return '<article class="resource-card"><header><span class="tile ' + (desk ? "mint" : "sky") + '">' + icon(desk ? "desk" : "rooms", 22) + '</span><span class="badge ' + (bookings.length ? "amber" : "green") + '">' + status + '</span></header><div><h2>' + esc(resource.name) + '</h2><p>' + esc(t(resource.floor) + " · " + t(geo)) + '</p></div><div class="tag-list">' +
    resource.amenities.map((value) => '<span class="tag">' + esc(t(value)) + '</span>').join("") +
    '</div>' + (occupiedHours.length ? t("<p class=\"occupied-hours\">Rezervované ") + esc(occupiedHours.join(", ")) + '</p>' : "") +
    button(t("Rezervovať"), "new-booking", "plus", "secondary", 'data-resource="' + esc(resource.id) + '"' + (busy ? " disabled" : "")) + '</article>';
}
function render(type, { state, office, resources, bookings, today }) {
  const desk = type === "desk";
  const filtered = resources.filter((r) => r.type === type && (!state.floor || r.floor === state.floor) &&
    (!state.query || [r.name, r.zone, r.capacity ? r.capacity + t(" osôb") : "", ...r.amenities].join(" ").toLocaleLowerCase("sk").includes(state.query.toLocaleLowerCase("sk"))));
  return pageHeader(desk ? t("Pracovné stoly") : t("Zasadačky"), desk ? t("Vyberte si miesto na prácu vo vybranej kancelárii.") : t("Nájdite miestnosť podľa kapacity a vybavenia."), button(t("Nová rezervácia"), "new-booking", "plus", "primary", 'data-type="' + type + '"')) +
    t("<section class=\"filter-bar panel\" aria-label=\"Filtre\"><label class=\"field filter-date\">Dátum<input type=\"date\" min=\"") + today + '" data-change="day" value="' + state.day + t("\"></label><label class=\"field\">Poschodie<select data-change=\"floor\"><option value=\"\">Všetky poschodia</option>") +
    office.floors.map((floor) => '<option' + (state.floor === floor ? " selected" : "") + ' value="' + esc(floor) + '">' + esc(t(floor)) + '</option>').join("") +
    t("</select></label><form class=\"resource-search\" data-form=\"search\"><label class=\"field\">Vyhľadávanie<input name=\"q\" type=\"search\" placeholder=\"Názov alebo vybavenie\" value=\"") + esc(state.query) + t("\"></label><button type=\"submit\" class=\"icon-button search-button\" aria-label=\"Vyhľadať\">") + icon("search", 18) + '</button></form></section>' +
    (filtered.length ? '<div class="results-caption"><strong>' + filtered.length + ' ' + (desk ? t("pracovných stolov") : t("zasadačiek")) + '</strong><span>' + esc(formatDate(state.day)) + '</span></div><div class="resource-grid">' +
    filtered.map((r) => resourceCard(r, bookings.filter((b) => b.resource === r.id && b.date === state.day))).join("") + "</div>" :
    emptyState(desk ? "desk" : "rooms", t("Žiadne výsledky"), t("Skúste upraviť poschodie alebo vyhľadávaný výraz."), button(t("Vymazať filtre"), "reset-filters")));
}
export const desks = { id: "desks", title: t("Pracovné stoly"), icon: "desk", group: t("Pracovný priestor"), configurable: true, description: t("Výber pracovného miesta a rezervácia podľa dostupnosti."), render: (context) => render("desk", context) };
export const rooms = { id: "rooms", title: t("Zasadačky"), icon: "rooms", group: t("Pracovný priestor"), configurable: true, description: t("Kapacita, vybavenie a termíny zasadacích miestností."), render: (context) => render("room", context) };
