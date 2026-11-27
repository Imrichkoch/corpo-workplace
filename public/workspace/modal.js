import { asset } from "./data.js";
import { esc, iconButton } from "./components.js";
import { icon } from "./icons.js";

export function showDialog(dialog, title, description, content) {
  const open = dialog.open;
  dialog.innerHTML = '<header class="dialog-heading"><div><h2 id="dialog-title">' + esc(title) + '</h2><p>' + esc(description) + '</p></div>' + iconButton("Zavrieť", "close-dialog", "close") + '</header>' + content;
  if (!open) dialog.showModal();
}
const footer = (text) => '<p class="form-error" role="alert"></p><footer class="dialog-footer"><button type="button" class="button secondary" data-action="close-dialog">Späť</button><button type="submit" class="button primary">' + esc(text) + '</button></footer>';

export function bookingForm(dialog, context, detail = {}) {
  const { office, resources, state, today, visible } = context;
  const resource = detail.resource ? asset(detail.resource) : null;
  const types = [visible("desks") ? "desk" : null, visible("rooms") ? "room" : null].filter(Boolean);
  if (!types.length) return;
  const type = detail.type || resource?.type || types[0];
  const date = detail.date || (state.route === "calendar" ? state.calendarDay : ["desks", "rooms"].includes(state.route) ? state.day : today);
  const start = detail.start || "09:00";
  const end = detail.end || (type === "desk" ? "17:00" : "10:00");
  const options = resources.filter((r) => r.type === type);
  const dateValue = date < today ? today : date;
  showDialog(dialog, "Nová rezervácia", office.name, '<form data-form="booking" class="dialog-form">' +
    '<fieldset class="type-selector"><legend>Typ priestoru</legend>' +
    types.map((value) => '<label><input name="type" type="radio" data-change="booking-type" value="' + value + '"' + (type === value ? " checked" : "") + '><span>' + icon(value === "desk" ? "desk" : "rooms", 18) + (value === "desk" ? "Pracovný stôl" : "Zasadačka") + '</span></label>').join("") +
    '</fieldset><label class="field">Priestor<select name="resource" required><option value="">Vyberte priestor</option>' +
    options.map((r) => '<option value="' + esc(r.id) + '"' + (r.id === resource?.id ? " selected" : "") + '>' + esc(r.name + " · " + r.floor) + '</option>').join("") +
    '</select></label><label class="field">Dátum<input name="date" type="date" min="' + today + '" value="' + esc(dateValue) + '" required></label><div class="field-pair"><label class="field">Od<input name="start" type="time" value="' + esc(start) + '" required></label><label class="field">Do<input name="end" type="time" value="' + esc(end) + '" required></label></div>' +
    '<label class="field">Názov <small>(nepovinné)</small><input name="title" placeholder="Napr. tímová porada" maxlength="100" value="' + esc(detail.title) + '"></label>' + footer("Potvrdiť rezerváciu") + '</form>');
}
export function visitForm(dialog, { office, today }) {
  showDialog(dialog, "Pridať návštevu", office.name, '<form data-form="visit" class="dialog-form"><label class="field">Meno a priezvisko<input name="name" required maxlength="100" autocomplete="off" placeholder="Meno návštevy"></label><label class="field">Firma <small>(nepovinné)</small><input name="company" maxlength="100" placeholder="Názov firmy"></label><div class="field-pair"><label class="field">Dátum<input name="date" type="date" min="' + today + '" value="' + today + '" required></label><label class="field">Čas<input name="time" type="time" value="10:00" required></label></div>' + footer("Uložiť návštevu") + '</form>');
}
export function confirmation(dialog, title, description, action, id) {
  showDialog(dialog, title, description, '<form class="dialog-form" data-form="confirm"><input type="hidden" name="action" value="' + esc(action) + '"><input type="hidden" name="id" value="' + esc(id) + '">' + footer("Potvrdiť") + '</form>');
}
