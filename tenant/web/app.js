import { language, languageSwitcher, t } from "./i18n.js";
import { button, brand, chip, e, empty, form, header, input, kinds, linkAttrs, list, option, options, panel, planImage, roles, row, select, shortDate, submit, svg, typePlural, visitStates } from "./ui.js";
import { adminForm, adminView, officeOptions, showEditorPin, updatePinEditor } from "./admin.js";

import { mfaPanel, securityPanel } from "./security.js";

const root = document.querySelector("#app");
const description = document.querySelector('meta[name="description"]');
description.content = t(description.content);
document.querySelector(".skip").textContent = t("Preskočiť na obsah");
const dialog = document.querySelector("#dialog");
const toast = document.querySelector("#toast");
const query = new URLSearchParams(location.search);
const mobileAdmin = query.get("mobileAdmin") === "1";
const tabs = [
  ["book",t("Rezervovať"),"reserve"],["calendar",t("Moje rezervácie"),"clock"],["map",t("Pôdorysy"),"map"],["visits",t("Návštevy"),"people"],["security",t("Zabezpečenie účtu"),"gear"],
  ["admin",t("Prehľad správy"),"gear",true],["inventory",t("Kancelárie a priestory"),"office",true],["plans",t("Správa pôdorysov"),"map",true],
  ["reservations",t("Správa rezervácií"),"reserve",true],["team",t("Ľudia a skupiny"),"people",true],["settings",t("Nastavenia firmy"),"gear",true],["mobile",t("Mobilná aplikácia"),"desk"],
];
const local = {
  get() { try { return localStorage.getItem("corpo.selectedTenant"); } catch { return ""; } },
  set(id) { try { localStorage.setItem("corpo.selectedTenant",id); } catch {} },
};
const [initialView, initialPlan = ""] = location.hash.slice(1).split("/");
const state = {
  account: null, data: null, tenant: "", office: "", kind: "", date: "", plan: initialView === "map" ? initialPlan : "", view: initialView || "book",
  mode: "login", link: null, token: "", entry: "", mobile: false, saving: false, loading: true,
  mfa: null, loadError: "", request: 0, mobileAdmin,
};
let toastTimer;
const isAdmin = () => state.data?.tenant.role !== "member" && Boolean(state.data?.tenant);
const available = (view) => view === "mobile" || tabs.some(([id,,,admin]) => id === view && (!admin || isAdmin()));
const officeName = (id) => state.data.offices.find(item => item.id === id)?.name || t("Kancelária");
const openButton = (label,type) => button(label,"open","plus","primary",'data-type="' + e(type) + '"');
const bookButton = (id) => button(t("Rezervovať"),"book",null,"primary",linkAttrs(id));
const commands = {
  "reservation.cancel": [t("Zrušiť rezerváciu?"), t("Tento čas bude opäť voľný.")],
  "visit.remove": [t("Odstrániť návštevu?"), t("Záznam sa odstráni z evidencie.")],
  "member.remove": [t("Odobrať používateľa?"), t("Člen stratí prístup a jeho budúce rezervácie sa uvoľnia.")],
  "team.remove": [t("Odstrániť skupinu?"), t("Odstránia sa priradenia členov do tejto skupiny.")],
  "plan.remove": [t("Odstrániť pôdorys?"), t("Rezervovateľné miesta zostanú dostupné a odstránia sa ich značky na mape.")],
  "invite.revoke": [t("Zrušiť pozvánku?"), t("Odkaz sa zneplatní.")],
  "office.archive": [t("Zmeniť dostupnosť kancelárie?"), t("Archivovanú kanceláriu možno obnoviť.")],
  "resource.archive": [t("Zmeniť dostupnosť priestoru?"), t("Archivovaný priestor možno obnoviť.")],
};
function tell(message, error = false) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = "shown" + (error ? " bad" : "");
  toastTimer = setTimeout(() => { toast.className = ""; }, 4300);
}
async function api(route, payload) {
  const headers = {"Accept-Language":language};
  const response = await fetch("./api/" + route, payload === undefined ? {cache:"no-store",headers} :
    {method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify(payload)});
  if (mobileAdmin && response.status === 401) reportMobileAdminClosed();
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw Object.assign(new Error(result?.message || t("Pracovisko je dočasne nedostupné.")), {status: response.status});
  return result;
}
function reportMobileAdminClosed() {
  window.ReactNativeWebView?.postMessage("corpo-admin-expired");
}
const endpoint = () => "tenant/" + encodeURIComponent(state.tenant);
function labelToday() {
  return state.data ? shortDate(state.data.date) : "";
}
function setAccount(account, preferred = "") {
  state.account = account;
  const id = preferred || state.tenant || local.get();
  state.tenant = account.tenants.find(item => item.id === id)?.id || account.tenants[0]?.id || "";
  if (state.tenant) local.set(state.tenant);
}
async function refresh({ quiet = false } = {}) {
  if (!state.tenant) { state.loading = false; render(); return; }
  const request = ++state.request;
  const prior = state.data;
  if (!quiet) { state.loading = true; render(); }
  try {
    const data = await api(endpoint() + (state.date ? "?date=" + encodeURIComponent(state.date) : ""));
    if (request !== state.request) return;
    state.mfa = null;
    state.data = data;
    state.date = data.date;
    state.loadError = "";
    const company = state.account.tenants.find(item => item.id === state.tenant);
    if (company) Object.assign(company,data.tenant);
    if (!available(state.view)) state.view = "book";
    if (!data.offices.some(office => office.id === state.office)) state.office = "";
    if (!data.plans.some(plan => plan.id === state.plan)) state.plan = "";
  } catch (error) {
    if (request !== state.request) return;
    if (error.status === 401) {
      state.account = null; state.data = null; state.tenant = ""; state.mfa = null;
    } else if (error.status === 428) {
      state.data = null;
      state.loadError = "";
      if (dialog.open) dialog.close();
      try {
        const status = await api(endpoint() + "/mfa");
        if (request === state.request) state.mfa = {step:status.enrolled ? "verify" : "email"};
      } catch (problem) { if (request === state.request) state.loadError = problem.message; }
    } else if (error.status === 404) {
      try { setAccount(await api("account")); } catch {}
      if (request !== state.request) return;
      state.data = null;
      if (state.tenant && state.tenant !== prior?.tenant.id && !quiet && prior) return refresh();
      state.loadError = error.message;
    } else {
      state.loadError = error.message;
      if (quiet) tell(error.message,true);
    }
  } finally {
    if (request === state.request) { state.loading = false; render(); }
  }
}

function guest() {
  const info = state.link;
  const mode = state.mode;
  const title = { sso:t("Prihlásenie cez Microsoft Entra"), login:t("Prihlásenie"), signup:t("Vytvorenie pracoviska"), reset:t("Obnovenie hesla"),
    link: info?.kind === "invite" ? t("Prijmite pozvánku") : info?.kind === "reset" ? t("Nastavte nové heslo") : t("Potvrďte nové pracovisko"),
    sent:t("Skontrolujte e-mail"), error:t("Odkaz sa nedá otvoriť") }[mode];
  const emailInput = input(t("E-mail"),"email",'type="email" required autocomplete="email" maxlength="254"');
  const pwd = (newPassword = false) => input(newPassword ? t("Nové heslo") : t("Heslo"),"password",'type="password" required maxlength="128" ' +
    (newPassword ? 'minlength="10" autocomplete="new-password"' : 'autocomplete="current-password"'));
  let fields = "", note = "";
  if (mode === "login") {
    fields = emailInput + pwd() + '<p class="auth-tools">' + button(t("Zabudnuté heslo"),"guest-mode",null,"text",'data-mode="reset"') + '</p>';
    note = t("Prihláste sa do firemného pracoviska.");
  }
  if (mode === "sso") {
    fields = input(t("Identifikátor firmy pre prihlásenie SSO"),"tenant",'required maxlength="22" autocomplete="off" autocapitalize="none"');
    note = t("Zadajte identifikátor, ktorý vám poskytol správca firmy.");
  }
  if (mode === "signup") {
    fields = input(t("Názov firmy"),"company",'required autocomplete="organization" maxlength="120"') +
      input(t("Meno a priezvisko"),"name",'required autocomplete="name" maxlength="120"') + emailInput;
    note = t("Firemný účet vytvoríte potvrdením overovacieho e-mailu.");
  }
  if (mode === "reset") { fields = emailInput; note = t("Pošleme vám odkaz na nastavenie nového hesla."); }
  if (mode === "link") {
    const fresh = !info.existing || info.kind === "reset";
    fields = (!info.existing && !info.name ? input(t("Meno a priezvisko"),"name",'required autocomplete="name" maxlength="120"') : "") +
      pwd(fresh) + (fresh ? t("<small class=\"quiet\">Použite aspoň 10 znakov.</small>") : "");
    note = [info.company,info.email].filter(Boolean).join(" · ");
  }
  if (mode === "sent" || mode === "error") note = state.entry;
  const submitLabels = {sso:t("Pokračovať do Microsoft Entra"),login:t("Prihlásiť sa"),signup:t("Poslať overovací e-mail"),reset:t("Poslať odkaz"),link:t("Potvrdiť a pokračovať")};
  const formContent = fields ? '<form data-form="guest-' + mode + '">' + fields + submit(submitLabels[mode]) + '</form>' : "";
  const ssoButton = mode === "login" ? button(t("Prihlásiť sa cez Microsoft Entra"),"guest-mode",null,"secondary",'data-mode="sso"') : "";
  const switcher = mode === "login" ? button(t("Vytvoriť firemný účet"),"guest-mode",null,"text",'data-mode="signup"') :
    (mode !== "link" ? button(t("Späť na prihlásenie"),"guest-mode",null,"text",'data-mode="login"') : "");
  return '<main id="main" class="auth-page"><section class="auth-brand">' + brand() +
    t("<div class=\"auth-message\"><h2>Kancelária pod kontrolou.</h2><p>Rezervujte si miesto pri stole, v zasadačke aj na parkovisku.</p></div><a href=\"../\" class=\"landing-link\">O Corpo Workplace</a></section>") +
    '<section class="auth-form"><div class="auth-content"><div class="mobile-brand">' + brand() + '</div><h1>' + e(title) + '</h1><p>' + e(note) + '</p>' +
    formContent + ssoButton + '<div class="auth-footer">' + switcher +
    languageSwitcher(state.token ? "#link=" + state.token : undefined) + '</div></div></section></main>';
}

function navigation() {
  function links(admin) { return tabs.filter((tab) => Boolean(tab[3]) === admin && (!admin || isAdmin())).map(([id,label,glyph]) =>
    '<a href="#' + id + '"' + (state.view === id ? ' aria-current="page"' : '') + '>' + svg(glyph,19) + e(label) + '</a>').join(""); }
  if (!state.data) return "";
  return t("<nav aria-label=\"Hlavná navigácia\">") + (mobileAdmin ? "" : '<div class="nav-label">' + t("Pracovisko") + '</div>' + links(false)) +
    (isAdmin() ? t("<div class=\"nav-label admin-label\">Správa firmy</div>") + links(true) : "") + '</nav>';
}
function chrome() {
  const user = state.account.user;
  const initials = user.name.trim().split(/\s+/).slice(0,2).map(part => part[0]?.toUpperCase()).join("");
  return '<div class="layout' + (state.mobile ? " nav-open" : "") + t("\"><button type=\"button\" class=\"scrim\" data-action=\"menu\" aria-label=\"Zavrieť navigáciu\"></button>") +
    '<aside id="sidebar">' + brand() + navigation() +
    '<div class="profile"><span class="avatar" aria-hidden="true">' + e(initials) + '</span><div><strong>' + e(user.name) + '</strong><span>' +
    e(roles[state.data?.tenant.role] || user.email) + '</span></div>' + button(t("Odhlásiť"),"logout","logout","icon",t("title=\"Odhlásiť sa\"")) + '</div></aside>' +
    '<div class="outer"><div class="top"><div>' + button(t("Navigácia"),"menu","menu","icon mobile-only",'aria-controls="sidebar" aria-expanded="' + state.mobile + '"') +
    (mobileAdmin ? (state.view === "admin" ? "" : t("<a class=\"text\" href=\"#admin\">Prehľad správy</a>")) : t("<strong>Firemné pracovisko</strong>")) +
    '</div><div class="top-right">' +
    (mobileAdmin ? "" : (isAdmin() ? t("<a class=\"btn secondary small top-admin-entry\" href=\"#admin\">Správa</a>") : "") +
      '<a class="text mobile-download" href="#mobile">' + svg("parking",16) + t("Mobilná aplikácia</a>") +
      (state.account.tenants.length ? select(t("Firma"),"tenant",options(state.account.tenants,state.tenant),'data-filter="tenant"') : "")) + languageSwitcher() +
    '</div></div><main id="main" tabindex="-1" class="workspace">' + workspace() + '</main></div></div>';
}
function filterBar(includeOffice = true, future = false) {
  const data = state.data;
  const minimum = future ? ' min="' + e(data.today) + '"' : "";
  return '<div class="filters">' + input(t("Dátum"),"date",'type="date" value="' + e(data.date) + '"' + minimum + ' data-filter="date"') +
    (includeOffice ? select(t("Kancelária"),"office",option("",t("Všetky kancelárie"),state.office) + options(data.offices.filter(o => !o.archived),state.office),'data-filter="office"') : "") + '</div>';
}
function inOffice(item) { return !state.office || item.office === state.office; }
function interval(item) { return item.start + " – " + item.end; }
function reservations(admin) {
  const data = state.data;
  const entries = (admin ? data.reservations : data.mine).filter(inOffice);
  const copy = admin ? t("Skontrolujte obsadenosť a spravujte rezervácie vybraného dňa.") : t("Prehľad vašich budúcich rezervácií stolov, zasadačiek a parkovacích miest.");
  const item = (entry) => row(entry.kind,entry.title || entry.resourceName,
    [entry.resourceName, officeName(entry.office),shortDate(entry.date),interval(entry),admin ? entry.member : ""].filter(Boolean).join(" · "),
    button(t("Zrušiť"),"change",null,"secondary small",'data-command="reservation.cancel" ' + linkAttrs(entry.id)));
  return header(admin ? t("Správa rezervácií") : t("Moje rezervácie"),copy) + (admin ? filterBar() : "") +
    panel(admin ? labelToday() : t("Nadchádzajúce rezervácie"),"",list(entries.map(item),t("Na toto obdobie nemáte žiadne rezervácie.")));
}
function bookView() {
  const data = state.data;
  const inventory = data.resources.filter(r => !r.disabled && inOffice(r));
  const tabsHtml = [["",t("Všetky"),"reserve"],...Object.entries(typePlural).map(([id,label]) => [id,label,id])].map(([id,label,icon]) =>
    '<button aria-pressed="' + (id === state.kind) + '" type="button" data-action="kind" data-kind="' + id + '">' +
    svg(icon,18) + e(label) + '<span>' + inventory.filter(r => !id || r.kind === id).length + '</span></button>').join("");
  const spaces = inventory.filter(r => !state.kind || r.kind === state.kind);
  const cards = spaces.map(r => {
    const reserved = data.busy.filter(b => b.resource === r.id).map(interval);
    return '<article class="resource"><div class="resource-top"><span class="tile ' + r.kind + '">' + svg(r.kind,21) + '</span>' +
      chip(reserved.length ? t("Má rezervácie") : t("Voľné"),reserved.length ? "warning" : "good") + '</div><h2>' + e(r.name) + '</h2>' +
      '<p class="resource-place">' + svg("location",15) + e(officeName(r.office)) + (r.kind === "room" ? " · " + r.capacity + t(" osôb") : "") + '</p>' +
      (r.description ? '<p>' + e(r.description) + '</p>' : '') +
      '<div class="resource-foot"><span>' + (reserved.length ? svg("clock",15) + e(reserved.join(", ")) : e(kinds[r.kind])) + '</span>' + bookButton(r.id) + '</div></article>';
  });
  const action = data.plans.some(p => inOffice(p) && data.offices.some(o => o.id === p.office && !o.archived))
    ? '<a class="btn primary" href="#map">' + svg("map",17) + t("Rezervovať z pôdorysu</a>")
    : isAdmin() && !data.offices.some(o => !o.archived) ? openButton(t("Pridať kanceláriu"),"office") : "";
  return header(t("Rezervovať priestor"),t("Vyberte si stôl, zasadačku alebo parkovacie miesto."),action) +
    '<div class="shape-filters">' + filterBar(true,true) + t("<div class=\"segments\" aria-label=\"Typ priestoru\">") + tabsHtml + '</div></div>' +
    (cards.length ? '<div class="resource-grid">' + cards.join("") + '</div>' :
      empty("office",t("Žiadne priestory"),t("V tomto výbere zatiaľ nie sú žiadne rezervovateľné miesta."),
            isAdmin() && data.offices.some(o => !o.archived) ? openButton(t("Pridať priestor"),"resource") : ""));
}
function mapView() {
  const {data} = state;
  const plans = data.plans.filter(p => inOffice(p) && data.offices.some(o => o.id === p.office && !o.archived));
  const selected = plans.find(p => p.id === state.plan) || plans[0];
  const heading = header(t("Pôdorysy"),t("Vyberte pôdorys a kliknite na miesto, ktoré chcete rezervovať.")) + filterBar(true,true);
  if (!selected) {
    const manage = isAdmin() ? t("<a class=\"btn secondary\" href=\"#plans\">Prejsť na správu pôdorysov</a>") : "";
    const where = state.office ? officeName(state.office) : data.tenant.name;
    return heading + empty("map",t("Žiadny pôdorys v tomto výbere"),where + t(" zatiaľ nemá dostupný pôdorys."),manage);
  }

  const places = data.resources.filter(r => !r.disabled && r.plan === selected.id &&
    Number.isFinite(r.x) && Number.isFinite(r.y));
  const choices = plans.map(plan => {
    const parking = plan.kind === "parking";
    return '<a class="plan-choice" href="#map/' + e(plan.id) + '"' + (plan === selected ? ' aria-current="location"' : "") + '>' +
      '<span class="tile ' + (parking ? "parking" : "desk") + '">' + svg(parking ? "parking" : "office",19) + '</span>' +
      '<span><strong>' + e(plan.name) + '</strong><small>' + e(officeName(plan.office)) + '</small></span></a>';
  });
  const rows = places.map(place => {
    const occupied = data.busy.filter(slot => slot.resource === place.id).map(interval);
    const availability = occupied.length ? t("Rezervované ") + occupied.join(", ") : t("Bez rezervácií v tento deň");
    return row(place.kind,place.name,kinds[place.kind] + " · " + availability,bookButton(place.id));
  });
  return heading + t("<nav class=\"plan-choices\" aria-label=\"Výber pôdorysu\">") + choices.join("") + '</nav>' +
    panel(selected.name,officeName(selected.office) + " · " + labelToday(),
      (places.length ? t("<div class=\"map-key\"><span>Značka otvorí rezerváciu</span><span>Má rezervované časy</span></div>") : "") +
      planImage(data.tenant.id,selected.id,places,selected.name,false,data.busy)) +
    panel(t("Miesta na pôdoryse"),t("Rezerváciu môžete otvoriť aj zo zoznamu."),
      list(rows,t("Na tomto pôdoryse zatiaľ nemáte dostupné označené miesta.")));
}
function visitsView() {
  const visits = state.data.visits.filter(inOffice);
  const entries = visits.map(item => {
    const action = item.status === "departed" ? "" :
      button(item.status === "expected" ? t("Príchod") : t("Odchod"),"change",null,"secondary small",'data-command="visit.next" data-status="' + item.status + '" ' + linkAttrs(item.id));
    return row("people",item.name,[item.company,officeName(item.office),item.time].filter(Boolean).join(" · "),
      action + button(t("Odstrániť"),"change",null,"secondary small",'data-command="visit.remove" ' + linkAttrs(item.id)),
      chip(visitStates[item.status],item.status === "arrived" ? "good" : ""));
  });
  return header(t("Návštevy"),t("Naplánujte návštevu a zaznamenajte jej príchod aj odchod."),
    state.data.offices.some(o => !o.archived) ? openButton(t("Pridať návštevu"),"visit") : "") +
    filterBar() + panel(labelToday(),"",list(entries,t("Na tento deň nemáte naplánované návštevy.")));
}
function mobileView() {
  return header(t("Corpo v mobile"),t("Otvorte pracovisko na Androide alebo iPhone.")) +
    panel(t("Pridanie na plochu"),t("Aplikácia sa otvorí samostatne a používa rovnaký účet."),
      t("<div class=\"mobile-help\"><p><strong>Android</strong> V Chrome otvorte ponuku a vyberte možnosť Nainštalovať aplikáciu alebo Pridať na plochu.</p>") +
      t("<p><strong>iPhone</strong> V Safari vyberte Zdieľať a Pridať na plochu.</p></div>") +
      t("<div class=\"launch-links\"><a class=\"btn primary\" href=\"../downloads/corpo-workplace-android.apk\" download>Stiahnuť Android APK</a><a class=\"btn secondary\" href=\"corpo-workplace://signin\">Otvoriť nainštalovanú aplikáciu</a></div>"));
}
function workspace() {
  if (state.mfa && !state.loading) return mfaPanel(state.mfa);
  if (state.loading && !state.data) return t("<p class=\"initial\">Načítavam pracovisko…</p>");
  if (state.loadError && !state.data) return empty("office",t("Pracovisko sa nepodarilo načítať"),state.loadError,button(t("Skúsiť znova"),"retry"));
  if (!state.data) return empty("office",t("Zatiaľ nemáte pracovisko"),t("Vytvorte si vlastnú firmu alebo prijmite pozvánku z e-mailu."),openButton(t("Vytvoriť pracovisko"),"tenant"));
  if (state.view === "mobile") return mobileView();
  if (state.view === "security") return header(t("Zabezpečenie účtu"),state.data.tenant.name) + securityPanel(state.data,mobileAdmin);
  if (state.view === "book") return bookView();
  if (state.view === "calendar" || state.view === "reservations") return reservations(state.view === "reservations");
  if (state.view === "map") return mapView();
  if (state.view === "visits") return visitsView();
  return adminView(state.view,state.data,state);
}
function render() {
  root.innerHTML = state.account ? chrome() : state.loading ?
    t("<main id=\"main\" class=\"initial\">Načítavam pracovisko…</main>") : mobileAdmin
    ? '<main id="main" class="workspace">' + empty("gear",t("Otvorte správu znova"),t("Pokračujte zo svojho účtu v mobilnej aplikácii.")) + '</main>'
    : guest();
}
function navigate() {
  const [target, plan] = location.hash.slice(1).split("/");
  if (!target || target === "main" || target.startsWith("link=")) return;
  const found = tabs.find(([id]) => id === target);
  if (!found && target !== "mobile") return;
  if (target === "mobile" || available(target) || !state.data) state.view = target;
  else state.view = "book";
  if (state.view === "map" && plan) {
    state.plan = plan;
    const office = state.data?.plans.find(item => item.id === plan)?.office;
    if (office && state.office && state.office !== office) state.office = "";
  }
  if (!["book","inventory"].includes(state.view)) state.kind = "";
  if (["book","map"].includes(state.view) && state.data && state.date < state.data.today) state.date = state.data.today;
  state.mobile = false;
  render();
  root.querySelector("#main")?.focus({preventScroll:true});
  scrollTo(0,0);
  if (state.data && state.view !== "mobile") void refresh({quiet:true});
}
function modal(title, markup) {
  dialog.innerHTML = '<header><h2 id="dialog-title">' + e(title) + '</h2>' +
    button(t("Zavrieť"),"close","close","icon") + '</header>' + markup;
  if (!dialog.open) dialog.showModal();
}
function hasOffice() { return state.data?.offices.some(o => !o.archived); }
function modalOpen(type,id) {
  if (type === "visit") {
    if (!hasOffice()) return;
    modal(t("Nová návšteva"),form("visit.create",
      select(t("Kancelária"),"office",officeOptions(state.data,state.office || state.data.offices.find(o => !o.archived).id),"required") +
      input(t("Meno návštevy"),"name",'required maxlength="120"') + input(t("Firma"),"company",'maxlength="120"') +
      '<div class="fields">' + input(t("Dátum"),"date",'type="date" required min="' + state.data.today + '" value="' + [state.date,state.data.today].sort().at(-1) + '"') +
      input(t("Čas"),"time",'type="time" required value="10:00"') + '</div>',t("Uložiť návštevu")));
    return;
  }
  if (type !== "tenant" && !isAdmin()) return;
  if (["plan","resource"].includes(type) && !hasOffice()) return;
  const contents = adminForm(type,id,state.data,state.office);
  if (!contents) return;
  modal(...contents);
  if (type === "resource") updatePinEditor(dialog.querySelector("form"),state.data);
}
function book(id) {
  const item = state.data?.resources.find(r => r.id === id);
  if (!item || item.disabled) return;
  const cap = item.kind === "room" ? "10:00" : "17:00";
  modal(t("Rezervovať ") + item.name,form("reservation.create",
    '<p class="quiet">' + e([officeName(item.office),kinds[item.kind]].join(" · ")) + '</p><input type="hidden" name="resource" value="' + e(item.id) + '">' +
    input(t("Dátum"),"date",'type="date" required min="' + state.data.today + '" value="' + [state.date,state.data.today].sort().at(-1) + '"') +
    '<p class="slot-status" data-slot-status aria-live="polite"></p>' +
    '<div class="fields">' + input(t("Od"),"start",'type="time" value="09:00" required') +
    input(t("Do"),"end",'type="time" value="' + cap + '" required') + '</div>' +
    input(t("Názov rezervácie (voliteľné)"),"title",'maxlength="100"'),t("Potvrdiť rezerváciu")));
  void loadBookingSlots(dialog.querySelector("form"));
}
async function loadBookingSlots(formElement) {
  const date = formElement.elements.date;
  const output = formElement.querySelector("[data-slot-status]");
  const selected = date.value, tenant = state.tenant;
  if (!selected || !date.validity.valid) { output.textContent = ""; return; }
  const id = formElement.elements.resource.value;
  const current = () => dialog.open && formElement.isConnected && state.tenant === tenant && date.value === selected;
  output.textContent = t("Overujem rezervované časy…");
  try {
    const data = state.data.date === selected ? state.data : await api(endpoint() + "?date=" + encodeURIComponent(selected));
    if (!current()) return;
    const slots = data.busy.filter(slot => slot.resource === id).map(interval);
    output.textContent = slots.length ? t("Rezervované časy: ") + slots.join(", ") : t("Na tento deň zatiaľ nie sú rezervované časy.");
  } catch {
    if (current()) output.textContent = t("Rezervované časy sa nepodarilo načítať.");
  }
}
function confirmChange(element) {
  const {id,command,archived,status} = element.dataset;
  if (command === "visit.next") {
    mutate(command,{id,status}).catch(error => tell(error.message,true));
    return;
  }
  if (!commands[command]) return;
  const [title,details] = commands[command];
  modal(title,form(command,'<p class="quiet">' + e(details) + '</p><input type="hidden" name="id" value="' + e(id) + '">' +
    (archived !== undefined ? '<input type="hidden" name="archived" value="' + e(archived) + '">' : ""),t("Potvrdiť")));
}

async function mutate(action, record) {
  const result = await api(endpoint(),{action,record});
  if (action === "reservation.create") state.date = record.date;
  if (action === "tenant.rename") state.account = await api("account");
  await refresh({quiet:true});
  const invite = action === "invite.send";
  tell(invite ? (result.delivery === "sent" ? t("Pozvánka bola odoslaná.") : t("Pozvánka sa uložila. E-mail zlyhal, môžete ho poslať znova.")) :
    action === "reservation.create" ? t("Rezervácia je potvrdená.") : t("Zmena bola uložená."), invite && result.delivery !== "sent");
}
function fileData(file) {
  if (!file?.size) return Promise.resolve("");
  if (file.size > 3 * 1024 * 1024) throw new Error(t("Nahrajte obrázok do 3 MB."));
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(t("Súbor sa nepodarilo prečítať.")));
    reader.onload = () => resolve(String(reader.result).split(",",2)[1]);
    reader.readAsDataURL(file);
  });
}
async function guestSubmit(action, data) {
  if (action === "sso") {
    const result = await api("auth/entra/start",data);
    location.assign(result.url);
    return;
  }
  if (action === "link") data.token = state.token;
  const result = await api("auth/" + (action === "link" ? "accept" : action),data);
  if (action === "login" || action === "link") {
    setAccount(result);
    state.token = "";
    state.link = null;
    await refresh();
  } else {
    state.mode = "sent";
    state.entry = result.message;
    render();
  }
}
async function submitForm(event) {
  const element = event.target;
  const key = element.dataset.form;
  if (!key) return;
  event.preventDefault();
  if (state.saving) return;
  state.saving = true;
  const errorOutput = element.querySelector(".form-error");
  const buttonElement = element.querySelector('[type="submit"]');
  errorOutput.hidden = true;
  buttonElement.disabled = true;
  try {
    const fields = new FormData(element), values = Object.fromEntries(fields);
    for (const name of ["archived","x","y","capacity"]) if (name in values && values[name] !== "") values[name] = Number(values[name]);
    if (key.startsWith("guest-")) await guestSubmit(key.slice(6),values);
    else if (key === "security-save") {
      for (const flag of ["sso","mfa","directory"]) values[flag] = fields.has(flag);
      await api(endpoint() + "/security",values);
      await refresh({quiet:true});
      tell(t("Zmena bola uložená."));
    } else if (key === "security-link") {
      const result = await api(endpoint() + "/entra",values);
      location.assign(result.url);
    } else if (key.startsWith("mfa-")) {
      const step = key.slice(4);
      const result = await api(endpoint() + "/mfa/" + step,values);
      if (step === "email") state.mfa = {step:"setup"};
      else if (step === "setup") state.mfa = {step:"verify",secret:result.secret};
      else if (result.recoveryCodes.length) state.mfa = {step:"recovery",recoveryCodes:result.recoveryCodes};
      else { state.mfa = null; await refresh(); }
      render();
    } else if (key === "account/tenants") {
      const result = await api(key,values);
      state.data = null;
      state.office = ""; state.kind = ""; state.plan = ""; state.date = "";
      setAccount(result,result.id); state.view = "book"; history.replaceState(null,"","#book");
      await refresh();
      dialog.close();
      tell(t("Pracovisko bolo vytvorené."));
    } else {
      if (key === "member.save") values.teams = fields.getAll("teams");
      if (key === "plan.save") values.image = await fileData(values.image);
      await mutate(key,values);
      dialog.close();
    }
  } catch (error) {
    errorOutput.textContent = error.message;
    errorOutput.hidden = false;
  } finally { buttonElement.disabled = false; state.saving = false; }
}
document.addEventListener("submit",submitForm);
document.addEventListener("click",event => {
  const point = event.target.closest("[data-pin-edit] img");
  if (point) {
    const rect = point.getBoundingClientRect(), formElement = point.closest("form");
    formElement.elements.x.value = ((event.clientX - rect.left) * 100 / rect.width).toFixed(1);
    formElement.elements.y.value = ((event.clientY - rect.top) * 100 / rect.height).toFixed(1);
    showEditorPin(formElement);
  }
  const element = event.target.closest("[data-action]");
  if (!element || state.saving) return;
  const {action,mode,type,id,kind} = element.dataset;
  switch (action) {
    case "guest-mode": state.mode = mode; state.entry = ""; render(); break;
    case "close": dialog.close(); break;
    case "open": modalOpen(type,id); break;
    case "book": book(id); break;
    case "change": confirmChange(element); break;
    case "retry": refresh(); break;
    case "mfa-continue": state.mfa = null; refresh(); break;
    case "mfa-restart": state.mfa = {step:"email"}; render(); break;
    case "kind": state.kind = kind; render(); root.querySelector('.segments [aria-pressed="true"]')?.focus(); break;
    case "menu": state.mobile = !state.mobile; render(); root.querySelector(state.mobile ? '#sidebar nav a' : '.mobile-only')?.focus(); break;
    case "logout":
      api("auth/logout",{}).then(() => { ++state.request; state.account = null; state.data = null; state.tenant = ""; state.mfa = null; state.mode = "login"; state.date = ""; state.office = ""; state.kind = ""; state.plan = ""; state.mobile = false; history.replaceState(null,"",mobileAdmin ? "?mobileAdmin=1#admin" : "./"); render(); if (mobileAdmin) reportMobileAdminClosed(); }).catch(error => tell(error.message,true));
      break;
  }
});
document.addEventListener("change",event => {
  const element = event.target, filter = element.dataset.filter;
  if (filter === "tenant" && state.account.tenants.some(t => t.id === element.value)) {
    state.mfa = null; state.tenant = element.value; local.set(state.tenant); state.data = null; state.date = ""; state.office = ""; state.plan = ""; state.kind = "";
    if (state.view === "map") history.replaceState(null,"","#map");
    refresh();
  } else if (filter === "date" && element.value && element.validity.valid) { state.date = element.value; refresh({quiet:true}); }
  else if (filter === "office" || filter === "kind") {
    state[filter] = element.value;
    if (filter === "office" && state.view === "map") {
      state.plan = "";
      history.replaceState(null,"","#map");
    }
    render();
  }
  if (element.form?.dataset.form === "reservation.create" && element.name === "date") void loadBookingSlots(element.form);
  if (element.form?.dataset.form === "resource.save") {
    if (element.hasAttribute("data-resource-field") || element.hasAttribute("data-resource-plan")) {
      if (element.hasAttribute("data-resource-plan")) { element.form.elements.x.value = ""; element.form.elements.y.value = ""; }
      updatePinEditor(element.form,state.data,element.hasAttribute("data-resource-field"));
    }
    if (element.name === "x" || element.name === "y") showEditorPin(element.form);
  }
});
dialog.addEventListener("cancel",event => { if (state.saving) event.preventDefault(); });
document.addEventListener("keydown",event => { if (event.key === "Escape" && state.mobile) { state.mobile = false; render(); } });
window.addEventListener("hashchange",() => location.hash.startsWith("#link=") ? start() : navigate());

async function start() {
  const raw = new URLSearchParams(location.hash.slice(1)).get("link");
  if (raw) {
    const clean = new URL(location.href);
    clean.hash = "";
    history.replaceState(null,"",clean);
    ++state.request; state.account = null; state.data = null; state.tenant = ""; state.date = "";
    state.office = ""; state.plan = ""; state.kind = ""; state.mobile = false;
    state.view = "book"; state.loading = true; render();
    try { state.link = await api("auth/link",{token:raw}); state.token = raw; state.mode = "link"; }
    catch (error) { state.mode = "error"; state.entry = error.message; }
    state.loading = false; render(); return;
  }
  if (location.hash === "#signup") state.mode = "signup";
  try { setAccount(await api("account"),query.get("tenant") || ""); }
  catch (error) { if (error.status !== 401) { state.mode = "error"; state.entry = error.message; } }
  if (state.account) {
    if (query.has("tenant")) {
      const clean = new URL(location.href);
      clean.searchParams.delete("tenant");
      history.replaceState(null,"",clean);
    }
    await refresh();
  } else { state.loading = false; render(); }
}
start();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
