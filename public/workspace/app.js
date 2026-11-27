import { icon, logo } from "./icons.js";
import { avatar, button, emptyState, esc, iconButton } from "./components.js";
import { asset, dayKey, offices, resources, shiftDay } from "./data.js";
import { modules } from "./registry.js";
import { bookingForm, confirmation, visitForm } from "./modal.js";
import { makeStorage, readLocal, writeLocal } from "./storage.js";
import { checkBooking, checkVisit, validDate } from "./validation.js";

const root = document.getElementById("corpo-app");
const hosted = root.dataset.server === "true";
const storage = makeStorage(hosted);
const today = dayKey();
const moduleKey = "corpo:hidden-modules";
const locationKey = "corpo:office";
const state = {
  route: "overview", office: readLocal(locationKey, offices[0].id),
  day: today, calendarDay: today, floor: "", query: "", visitorFilter: "",
  hiddenModules: readLocal(moduleKey, []), data: null, menu: false, loading: true, error: "",
};
if (!Array.isArray(state.hiddenModules)) state.hiddenModules = [];
if (!offices.some((office) => office.id === state.office)) state.office = offices[0].id;

root.innerHTML = '<div class="shell"><div class="mobile-overlay" data-action="menu"></div><aside id="sidebar" class="sidebar" aria-label="Hlavná navigácia"></aside><div class="workspace"><header class="topbar" id="topbar"></header><main class="content" id="main" tabindex="-1"></main></div></div><dialog id="dialog" aria-labelledby="dialog-title"></dialog><div class="toast" id="toast" role="status"></div>';
const sidebar = root.querySelector("#sidebar");
const topbar = root.querySelector("#topbar");
const main = root.querySelector("#main");
const dialog = root.querySelector("#dialog");
const toast = root.querySelector("#toast");
let toastTimeout;
let saving = false;

const visible = (id) => modules.some((m) => m.id === id) && !state.hiddenModules.includes(id);
const current = () => modules.find((m) => m.id === state.route) || modules[0];
const office = () => offices.find((item) => item.id === state.office);
function context() {
  return { state, office: office(), today, modules, visible, resources: resources.filter((r) => r.office === state.office), bookings: state.data.bookings.filter((b) => asset(b.resource)?.office === state.office) };
}
function notify(message) {
  clearTimeout(toastTimeout);
  toast.innerHTML = icon("check", 18) + esc(message);
  toast.classList.add("shown");
  toastTimeout = setTimeout(() => toast.classList.remove("shown"), 3800);
}
function links(group) {
  const entries = modules.filter((m) => m.group === group && visible(m.id));
  return entries.length ? '<div class="nav-group"><div class="nav-caption">' + esc(group) + '</div>' + entries.map((m) => '<a href="#' + m.id + '" data-route="' + m.id + '"' + (state.route === m.id ? ' aria-current="page"' : "") + '>' + icon(m.icon, 19) + '<span>' + esc(m.title) + "</span></a>").join("") + "</div>" : "";
}
function renderShell() {
  root.querySelector(".shell").classList.toggle("menu-open", state.menu);
  const profile = state.data?.profile;
  const groups = [...new Set(modules.map((module) => module.group))];
  sidebar.innerHTML = '<a href="#overview" class="brand" data-route="overview" aria-label="Corpo — prehľad"><span class="brand-mark">' + logo + '</span><span>corpo<span class="brand-period">.</span><small>WORKPLACE</small></span></a><nav>' +
    groups.map(links).join("") + '</nav>' +
    (profile ? '<div class="profile">' + avatar(profile.name, "mint") + '<span class="row-copy"><strong>' + esc(profile.name) + '</strong><span>' + (profile.demo ? "Ukážkové pracovisko" : "Firemné pracovisko") + '</span></span></div>' : '');
  topbar.innerHTML = '<div class="breadcrumb">' +
    iconButton("Zobraziť navigáciu", "menu", "menu", 'aria-controls="sidebar" aria-expanded="' + state.menu + '"') +
    '<span class="breadcrumb-home">Pracovisko</span>' + icon("right", 14) + '<strong>' + esc(current().title) + '</strong></div><div class="top-controls">' +
    '<label class="office-select"><span class="sr-only">Pracovisko</span>' + icon("building", 17) + '<select data-change="office" aria-label="Vybrať pracovisko">' + offices.map((item) => '<option value="' + item.id + '"' + (item.id === state.office ? " selected" : "") + '>' + esc(item.name) + '</option>').join("") + '</select>' + icon("down", 15) + '</label>' +
    '</div>';
}
function renderMain() {
  if (state.loading) {
    main.innerHTML = '<div class="loading" role="status">Načítavam pracovisko…</div>';
    return;
  }
  if (!state.data) {
    main.innerHTML = emptyState("building", "Pracovisko sa nepodarilo načítať", state.error, button("Skúsiť znova", "retry"));
    return;
  }
  main.innerHTML = current().render(context());
}
function render() { renderShell(); renderMain(); }
function route(focus = true) {
  const target = location.hash.slice(1) || "overview";
  const next = visible(target) ? target : "overview";
  if (target !== next) history.replaceState(null, "", "#overview");
  if (state.route !== next) {
    state.floor = "";
    state.query = "";
  }
  state.route = next;
  state.menu = false;
  if (dialog.open) dialog.close();
  render();
  if (focus) {
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}
async function load() {
  state.loading = true;
  render();
  try { state.data = await storage.load(); }
  catch (error) { state.error = error.message; }
  finally { state.loading = false; render(); }
}

const action = {
  menu() { state.menu = !state.menu; renderShell(); },
  retry: load,
  "close-dialog"() { if (!saving) dialog.close(); },
  "new-booking"(el) { bookingForm(dialog, context(), el.dataset); },
  "new-visit"() { visitForm(dialog, context()); },
  "reset-filters"() { state.floor = ""; state.query = ""; renderMain(); },
  "calendar-today"() { state.calendarDay = today; renderMain(); },
  "calendar-shift"(el) { state.calendarDay = shiftDay(state.calendarDay, Number(el.dataset.step)); renderMain(); },
  "select-calendar-day"(el) {
    state.calendarDay = el.dataset.date;
    renderMain();
    main.querySelector('[data-action="select-calendar-day"][aria-pressed="true"]')?.focus();
  },
  "visitor-filter"(el) {
    state.visitorFilter = el.dataset.filter;
    renderMain();
    main.querySelector('[data-action="visitor-filter"][aria-pressed="true"]')?.focus();
  },
  "cancel-booking"(el) { confirmation(dialog, "Zrušiť rezerváciu?", "Priestor sa uvoľní pre ďalšiu rezerváciu.", "cancel-booking", el.dataset.id); },
  "delete-visit"(el) { confirmation(dialog, "Odstrániť návštevu?", "Záznam odstránite z evidencie návštev.", "delete-visit", el.dataset.id); },
  async "next-visit"(el) {
    if (saving) return;
    const visit = state.data.visits.find((v) => v.id === el.dataset.id);
    if (!visit) return;
    saving = true; el.disabled = true;
    try {
      state.data = await storage.update("next-visit", { id: visit.id, status: visit.status });
      render();
      notify(visit.status === "expected" ? "Príchod zaznamenaný." : "Odchod zaznamenaný.");
    } catch (error) { notify(error.message); }
    finally { saving = false; el.disabled = false; }
  },
};
root.addEventListener("click", (event) => {
  const linked = event.target.closest("[data-route]");
  if (linked?.dataset.route === state.route && state.menu) {
    state.menu = false; renderShell();
  }
  const element = event.target.closest("[data-action]");
  if (!element || element.disabled) return;
  const name = element.dataset.action;
  if (Object.hasOwn(action, name)) action[name](element);
  else if (current().actions && Object.hasOwn(current().actions, name)) current().actions[name](element, context(), renderMain);
});
dialog.addEventListener("cancel", (event) => { if (saving) event.preventDefault(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && state.menu) { state.menu = false; renderShell(); } });
root.addEventListener("change", (event) => {
  const el = event.target;
  switch (el.dataset.change) {
    case "office":
      if (!offices.some((item) => item.id === el.value)) return;
      state.office = el.value; state.floor = ""; state.query = ""; state.visitorFilter = "";
      writeLocal(locationKey, state.office); renderMain(); break;
    case "day":
      if (validDate(el.value) && el.value >= today) { state.day = el.value; renderMain(); } break;
    case "floor": state.floor = el.value; renderMain(); break;
    case "module":
      state.hiddenModules = el.checked ? state.hiddenModules.filter((id) => id !== el.value) : [...state.hiddenModules, el.value];
      writeLocal(moduleKey, state.hiddenModules); renderShell(); break;
    case "booking-type": {
      const data = Object.fromEntries(new FormData(el.form));
      delete data.resource;
      if (data.start === "09:00" && (data.end === "17:00" || data.end === "10:00")) delete data.end;
      bookingForm(dialog, context(), data);
      dialog.querySelector("input:checked")?.focus();
      break;
    }
    default: break;
  }
});
root.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!form.dataset.form) return;
  event.preventDefault();
  if (saving) return;
  const data = Object.fromEntries(new FormData(form));
  if (form.dataset.form === "search") {
    state.query = data.q.trim();
    renderMain();
    return;
  }
  const errorOutput = form.querySelector(".form-error");
  let actionName, record, error, message;
  if (form.dataset.form === "booking") {
    const { resource, date, start, end, title } = data;
    actionName = "create-booking";
    record = { resource, date, start, end, title: title.trim() };
    error = checkBooking(record, today);
    message = "Rezervácia potvrdená.";
  } else if (form.dataset.form === "visit") {
    actionName = "create-visit";
    record = { name: data.name.trim(), company: data.company.trim(), date: data.date, time: data.time, office: state.office };
    error = checkVisit(record, today);
    message = "Návšteva pridaná.";
  } else {
    actionName = data.action;
    record = { id: data.id };
    message = actionName === "cancel-booking" ? "Rezervácia zrušená." : "Návšteva odstránená.";
  }
  if (error) { errorOutput.textContent = error; return; }
  saving = true;
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  errorOutput.textContent = "";
  try {
    state.data = await storage.update(actionName, record);
    dialog.close();
    render();
    notify(message);
    main.focus({ preventScroll: true });
  } catch (error) { errorOutput.textContent = error.message; }
  finally { saving = false; submit.disabled = false; }
});
addEventListener("hashchange", () => route());
if (!hosted) addEventListener("storage", (event) => {
  if (event.key === "corpo:demo:v1") storage.load().then((data) => { state.data = data; renderMain(); });
});
route(false);
load();
