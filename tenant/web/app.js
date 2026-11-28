import { button, brand, chip, e, empty, form, header, input, kinds, linkAttrs, list, option, options, panel, planImage, roles, row, select, shortDate, submit, svg, typePlural, visitStates } from "./ui.js";
import { adminForm, adminView, officeOptions, showEditorPin, updatePinEditor } from "./admin.js";

const root = document.querySelector("#app");
const dialog = document.querySelector("#dialog");
const toast = document.querySelector("#toast");
const mobileAdmin = new URLSearchParams(location.search).get("mobileAdmin") === "1";
const tabs = [
  ["book","Rezervovať","reserve"],["calendar","Moje rezervácie","clock"],["map","Pôdorysy","map"],["visits","Návštevy","people"],
  ["admin","Prehľad správy","gear",true],["inventory","Kancelárie a priestory","office",true],["plans","Správa pôdorysov","map",true],
  ["reservations","Správa rezervácií","reserve",true],["team","Ľudia a skupiny","people",true],["settings","Nastavenia firmy","gear",true],["mobile","Mobilná aplikácia","desk"],
];
const local = {
  get() { try { return localStorage.getItem("corpo.selectedTenant"); } catch { return ""; } },
  set(id) { try { localStorage.setItem("corpo.selectedTenant",id); } catch {} },
};
const [initialView, initialPlan = ""] = location.hash.slice(1).split("/");
const state = {
  account: null, data: null, tenant: "", office: "", kind: "", date: "", plan: initialView === "map" ? initialPlan : "", view: initialView || "book",
  mode: "login", link: null, token: "", entry: "", mobile: false, saving: false, loading: true,
  loadError: "", request: 0, mobileAdmin,
};
let toastTimer;
const isAdmin = () => state.data?.tenant.role !== "member" && Boolean(state.data?.tenant);
const available = (view) => view === "mobile" || tabs.some(([id,,,admin]) => id === view && (!admin || isAdmin()));
const officeName = (id) => state.data.offices.find(item => item.id === id)?.name || "Kancelária";
const openButton = (label,type) => button(label,"open","plus","primary",'data-type="' + e(type) + '"');
const bookButton = (id) => button("Rezervovať","book",null,"primary",linkAttrs(id));
const commands = {
  "reservation.cancel": ["Zrušiť rezerváciu?", "Tento čas bude opäť voľný."],
  "visit.remove": ["Odstrániť návštevu?", "Záznam sa odstráni z evidencie."],
  "member.remove": ["Odobrať používateľa?", "Člen stratí prístup a jeho budúce rezervácie sa uvoľnia."],
  "team.remove": ["Odstrániť skupinu?", "Odstránia sa priradenia členov do tejto skupiny."],
  "plan.remove": ["Odstrániť pôdorys?", "Rezervovateľné miesta zostanú dostupné a odstránia sa ich značky na mape."],
  "invite.revoke": ["Zrušiť pozvánku?", "Odkaz sa zneplatní."],
  "office.archive": ["Zmeniť dostupnosť kancelárie?", "Archivovanú kanceláriu možno obnoviť."],
  "resource.archive": ["Zmeniť dostupnosť priestoru?", "Archivovaný priestor možno obnoviť."],
};
function tell(message, error = false) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = "shown" + (error ? " bad" : "");
  toastTimer = setTimeout(() => { toast.className = ""; }, 4300);
}
async function api(route, payload) {
  const response = await fetch("./api/" + route, payload === undefined ? {cache:"no-store"} :
    {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  if (mobileAdmin && response.status === 401) reportMobileAdminClosed();
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw Object.assign(new Error(result?.message || "Pracovisko je dočasne nedostupné."), {status: response.status});
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
      state.account = null; state.data = null; state.tenant = "";
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
  const title = { login:"Prihlásenie", signup:"Vytvorenie pracoviska", reset:"Obnovenie hesla",
    link: info?.kind === "invite" ? "Prijmite pozvánku" : info?.kind === "reset" ? "Nastavte nové heslo" : "Potvrďte nové pracovisko",
    sent:"Skontrolujte e-mail", error:"Odkaz sa nedá otvoriť" }[mode];
  const emailInput = input("E-mail","email",'type="email" required autocomplete="email" maxlength="254"');
  const pwd = (newPassword = false) => input(newPassword ? "Nové heslo" : "Heslo","password",'type="password" required maxlength="128" ' +
    (newPassword ? 'minlength="10" autocomplete="new-password"' : 'autocomplete="current-password"'));
  let fields = "", note = "";
  if (mode === "login") {
    fields = emailInput + pwd() + '<p class="auth-tools">' + button("Zabudnuté heslo","guest-mode",null,"text",'data-mode="reset"') + '</p>';
    note = "Prihláste sa do firemného pracoviska.";
  }
  if (mode === "signup") {
    fields = input("Názov firmy","company",'required autocomplete="organization" maxlength="120"') +
      input("Meno a priezvisko","name",'required autocomplete="name" maxlength="120"') + emailInput;
    note = "Firemný účet vytvoríte potvrdením overovacieho e-mailu.";
  }
  if (mode === "reset") { fields = emailInput; note = "Pošleme vám odkaz na nastavenie nového hesla."; }
  if (mode === "link") {
    const fresh = !info.existing || info.kind === "reset";
    fields = (!info.existing && !info.name ? input("Meno a priezvisko","name",'required autocomplete="name" maxlength="120"') : "") +
      pwd(fresh) + (fresh ? '<small class="quiet">Použite aspoň 10 znakov.</small>' : "");
    note = [info.company,info.email].filter(Boolean).join(" · ");
  }
  if (mode === "sent" || mode === "error") note = state.entry;
  const submitLabels = {login:"Prihlásiť sa",signup:"Poslať overovací e-mail",reset:"Poslať odkaz",link:"Potvrdiť a pokračovať"};
  const formContent = fields ? '<form data-form="guest-' + mode + '">' + fields + submit(submitLabels[mode]) + '</form>' : "";
  const switcher = mode === "login" ? button("Vytvoriť firemný účet","guest-mode",null,"text",'data-mode="signup"') :
    (mode !== "link" ? button("Späť na prihlásenie","guest-mode",null,"text",'data-mode="login"') : "");
  return '<main id="main" class="auth-page"><section class="auth-brand">' + brand() +
    '<div class="auth-message"><h2>Kancelária pod kontrolou.</h2><p>Rezervujte si miesto pri stole, v zasadačke aj na parkovisku.</p></div><a href="../" class="landing-link">O Corpo Workplace</a></section>' +
    '<section class="auth-form"><div class="auth-content"><div class="mobile-brand">' + brand() + '</div><h1>' + e(title) + '</h1><p>' + e(note) + '</p>' +
    formContent + '<div class="auth-footer">' + switcher + '</div></div></section></main>';
}

function navigation() {
  function links(admin) { return tabs.filter((tab) => Boolean(tab[3]) === admin && (!admin || isAdmin())).map(([id,label,glyph]) =>
    '<a href="#' + id + '"' + (state.view === id ? ' aria-current="page"' : '') + '>' + svg(glyph,19) + e(label) + '</a>').join(""); }
  if (!state.data) return "";
  return '<nav aria-label="Hlavná navigácia">' + (mobileAdmin ? "" : '<div class="nav-label">Pracovisko</div>' + links(false)) +
    (isAdmin() ? '<div class="nav-label admin-label">Správa firmy</div>' + links(true) : "") + '</nav>';
}
function chrome() {
  const user = state.account.user;
  const initials = user.name.trim().split(/\s+/).slice(0,2).map(part => part[0]?.toUpperCase()).join("");
  return '<div class="layout' + (state.mobile ? " nav-open" : "") + '"><button type="button" class="scrim" data-action="menu" aria-label="Zavrieť navigáciu"></button>' +
    '<aside id="sidebar">' + brand() + navigation() +
    '<div class="profile"><span class="avatar" aria-hidden="true">' + e(initials) + '</span><div><strong>' + e(user.name) + '</strong><span>' +
    e(roles[state.data?.tenant.role] || user.email) + '</span></div>' + button("Odhlásiť","logout","logout","icon",'title="Odhlásiť sa"') + '</div></aside>' +
    '<div class="outer"><div class="top"><div>' + button("Navigácia","menu","menu","icon mobile-only",'aria-controls="sidebar" aria-expanded="' + state.mobile + '"') +
    (mobileAdmin ? (state.view === "admin" ? "" : '<a class="text" href="#admin">Prehľad správy</a>') : '<strong>Firemné pracovisko</strong>') +
    '</div><div class="top-right">' +
    (mobileAdmin ? "" : (isAdmin() ? '<a class="btn secondary small top-admin-entry" href="#admin">Správa</a>' : "") +
      '<a class="text mobile-download" href="#mobile">' + svg("parking",16) + 'Mobilná aplikácia</a>' +
      (state.account.tenants.length ? select("Firma","tenant",options(state.account.tenants,state.tenant),'data-filter="tenant"') : "")) +
    '</div></div><main id="main" tabindex="-1" class="workspace">' + workspace() + '</main></div></div>';
}
function filterBar(includeOffice = true, future = false) {
  const data = state.data;
  const minimum = future ? ' min="' + e(data.today) + '"' : "";
  return '<div class="filters">' + input("Dátum","date",'type="date" value="' + e(data.date) + '"' + minimum + ' data-filter="date"') +
    (includeOffice ? select("Kancelária","office",option("","Všetky kancelárie",state.office) + options(data.offices.filter(o => !o.archived),state.office),'data-filter="office"') : "") + '</div>';
}
function inOffice(item) { return !state.office || item.office === state.office; }
function interval(item) { return item.start + " – " + item.end; }
function reservations(admin) {
  const data = state.data;
  const entries = (admin ? data.reservations : data.mine).filter(inOffice);
  const copy = admin ? "Skontrolujte obsadenosť a spravujte rezervácie vybraného dňa." : "Prehľad vašich budúcich rezervácií stolov, zasadačiek a parkovacích miest.";
  const item = (entry) => row(entry.kind,entry.title || entry.resourceName,
    [entry.resourceName, officeName(entry.office),shortDate(entry.date),interval(entry),admin ? entry.member : ""].filter(Boolean).join(" · "),
    button("Zrušiť","change",null,"secondary small",'data-command="reservation.cancel" ' + linkAttrs(entry.id)));
  return header(admin ? "Správa rezervácií" : "Moje rezervácie",copy) + (admin ? filterBar() : "") +
    panel(admin ? labelToday() : "Nadchádzajúce rezervácie","",list(entries.map(item),"Na toto obdobie nemáte žiadne rezervácie."));
}
function bookView() {
  const data = state.data;
  const inventory = data.resources.filter(r => !r.disabled && inOffice(r));
  const tabsHtml = [["","Všetky","reserve"],...Object.entries(typePlural).map(([id,label]) => [id,label,id])].map(([id,label,icon]) =>
    '<button aria-pressed="' + (id === state.kind) + '" type="button" data-action="kind" data-kind="' + id + '">' +
    svg(icon,18) + e(label) + '<span>' + inventory.filter(r => !id || r.kind === id).length + '</span></button>').join("");
  const spaces = inventory.filter(r => !state.kind || r.kind === state.kind);
  const cards = spaces.map(r => {
    const reserved = data.busy.filter(b => b.resource === r.id).map(interval);
    return '<article class="resource"><div class="resource-top"><span class="tile ' + r.kind + '">' + svg(r.kind,21) + '</span>' +
      chip(reserved.length ? "Má rezervácie" : "Voľné",reserved.length ? "warning" : "good") + '</div><h2>' + e(r.name) + '</h2>' +
      '<p class="resource-place">' + svg("location",15) + e(officeName(r.office)) + (r.kind === "room" ? " · " + r.capacity + " osôb" : "") + '</p>' +
      (r.description ? '<p>' + e(r.description) + '</p>' : '') +
      '<div class="resource-foot"><span>' + (reserved.length ? svg("clock",15) + e(reserved.join(", ")) : e(kinds[r.kind])) + '</span>' + bookButton(r.id) + '</div></article>';
  });
  const action = data.plans.some(p => inOffice(p) && data.offices.some(o => o.id === p.office && !o.archived))
    ? '<a class="btn primary" href="#map">' + svg("map",17) + 'Rezervovať z pôdorysu</a>'
    : isAdmin() && !data.offices.some(o => !o.archived) ? openButton("Pridať kanceláriu","office") : "";
  return header("Rezervovať priestor","Vyberte si stôl, zasadačku alebo parkovacie miesto.",action) +
    '<div class="shape-filters">' + filterBar(true,true) + '<div class="segments" aria-label="Typ priestoru">' + tabsHtml + '</div></div>' +
    (cards.length ? '<div class="resource-grid">' + cards.join("") + '</div>' :
      empty("office","Žiadne priestory","V tomto výbere zatiaľ nie sú žiadne rezervovateľné miesta.",
            isAdmin() && data.offices.some(o => !o.archived) ? openButton("Pridať priestor","resource") : ""));
}
function mapView() {
  const {data} = state;
  const plans = data.plans.filter(p => inOffice(p) && data.offices.some(o => o.id === p.office && !o.archived));
  const selected = plans.find(p => p.id === state.plan) || plans[0];
  const heading = header("Pôdorysy","Vyberte pôdorys a kliknite na miesto, ktoré chcete rezervovať.") + filterBar(true,true);
  if (!selected) {
    const manage = isAdmin() ? '<a class="btn secondary" href="#plans">Prejsť na správu pôdorysov</a>' : "";
    const where = state.office ? officeName(state.office) : data.tenant.name;
    return heading + empty("map","Žiadny pôdorys v tomto výbere",where + " zatiaľ nemá dostupný pôdorys.",manage);
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
    const availability = occupied.length ? 'Rezervované ' + occupied.join(", ") : "Bez rezervácií v tento deň";
    return row(place.kind,place.name,kinds[place.kind] + " · " + availability,bookButton(place.id));
  });
  return heading + '<nav class="plan-choices" aria-label="Výber pôdorysu">' + choices.join("") + '</nav>' +
    panel(selected.name,officeName(selected.office) + " · " + labelToday(),
      (places.length ? '<div class="map-key"><span>Značka otvorí rezerváciu</span><span>Má rezervované časy</span></div>' : "") +
      planImage(data.tenant.id,selected.id,places,selected.name,false,data.busy)) +
    panel("Miesta na pôdoryse","Rezerváciu môžete otvoriť aj zo zoznamu.",
      list(rows,"Na tomto pôdoryse zatiaľ nemáte dostupné označené miesta."));
}
function visitsView() {
  const visits = state.data.visits.filter(inOffice);
  const entries = visits.map(item => {
    const action = item.status === "departed" ? "" :
      button(item.status === "expected" ? "Príchod" : "Odchod","change",null,"secondary small",'data-command="visit.next" data-status="' + item.status + '" ' + linkAttrs(item.id));
    return row("people",item.name,[item.company,officeName(item.office),item.time].filter(Boolean).join(" · "),
      action + button("Odstrániť","change",null,"secondary small",'data-command="visit.remove" ' + linkAttrs(item.id)),
      chip(visitStates[item.status],item.status === "arrived" ? "good" : ""));
  });
  return header("Návštevy","Naplánujte návštevu a zaznamenajte jej príchod aj odchod.",
    state.data.offices.some(o => !o.archived) ? openButton("Pridať návštevu","visit") : "") +
    filterBar() + panel(labelToday(),"",list(entries,"Na tento deň nemáte naplánované návštevy."));
}
function mobileView() {
  return header("Corpo v mobile","Otvorte pracovisko na Androide alebo iPhone.") +
    panel("Pridanie na plochu","Aplikácia sa otvorí samostatne a používa rovnaký účet.",
      '<div class="mobile-help"><p><strong>Android</strong> V Chrome otvorte ponuku a vyberte možnosť Nainštalovať aplikáciu alebo Pridať na plochu.</p>' +
      '<p><strong>iPhone</strong> V Safari vyberte Zdieľať a Pridať na plochu.</p></div>' +
      '<div class="launch-links"><a class="btn primary" href="../downloads/corpo-workplace-android.apk" download>Stiahnuť Android APK</a><a class="btn secondary" href="corpo-workplace://signin">Otvoriť nainštalovanú aplikáciu</a></div>');
}
function workspace() {
  if (state.loading && !state.data) return '<p class="initial">Načítavam pracovisko…</p>';
  if (state.loadError && !state.data) return empty("office","Pracovisko sa nepodarilo načítať",state.loadError,button("Skúsiť znova","retry"));
  if (!state.data) return empty("office","Zatiaľ nemáte pracovisko","Vytvorte si vlastnú firmu alebo prijmite pozvánku z e-mailu.",openButton("Vytvoriť pracovisko","tenant"));
  if (state.view === "mobile") return mobileView();
  if (state.view === "book") return bookView();
  if (state.view === "calendar" || state.view === "reservations") return reservations(state.view === "reservations");
  if (state.view === "map") return mapView();
  if (state.view === "visits") return visitsView();
  return adminView(state.view,state.data,state);
}
function render() {
  root.innerHTML = state.account ? chrome() : state.loading ?
    '<main id="main" class="initial">Načítavam pracovisko…</main>' : mobileAdmin
    ? '<main id="main" class="workspace">' + empty("gear","Otvorte správu znova","Pokračujte zo svojho účtu v mobilnej aplikácii.") + '</main>'
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
    button("Zavrieť","close","close","icon") + '</header>' + markup;
  if (!dialog.open) dialog.showModal();
}
function hasOffice() { return state.data?.offices.some(o => !o.archived); }
function modalOpen(type,id) {
  if (type === "visit") {
    if (!hasOffice()) return;
    modal("Nová návšteva",form("visit.create",
      select("Kancelária","office",officeOptions(state.data,state.office || state.data.offices.find(o => !o.archived).id),"required") +
      input("Meno návštevy","name",'required maxlength="120"') + input("Firma","company",'maxlength="120"') +
      '<div class="fields">' + input("Dátum","date",'type="date" required min="' + state.data.today + '" value="' + [state.date,state.data.today].sort().at(-1) + '"') +
      input("Čas","time",'type="time" required value="10:00"') + '</div>',"Uložiť návštevu"));
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
  modal("Rezervovať " + item.name,form("reservation.create",
    '<p class="quiet">' + e([officeName(item.office),kinds[item.kind]].join(" · ")) + '</p><input type="hidden" name="resource" value="' + e(item.id) + '">' +
    input("Dátum","date",'type="date" required min="' + state.data.today + '" value="' + [state.date,state.data.today].sort().at(-1) + '"') +
    '<p class="slot-status" data-slot-status aria-live="polite"></p>' +
    '<div class="fields">' + input("Od","start",'type="time" value="09:00" required') +
    input("Do","end",'type="time" value="' + cap + '" required') + '</div>' +
    input("Názov rezervácie (voliteľné)","title",'maxlength="100"'),"Potvrdiť rezerváciu"));
  void loadBookingSlots(dialog.querySelector("form"));
}
async function loadBookingSlots(formElement) {
  const date = formElement.elements.date;
  const output = formElement.querySelector("[data-slot-status]");
  const selected = date.value, tenant = state.tenant;
  if (!selected || !date.validity.valid) { output.textContent = ""; return; }
  const id = formElement.elements.resource.value;
  const current = () => dialog.open && formElement.isConnected && state.tenant === tenant && date.value === selected;
  output.textContent = "Overujem rezervované časy…";
  try {
    const data = state.data.date === selected ? state.data : await api(endpoint() + "?date=" + encodeURIComponent(selected));
    if (!current()) return;
    const slots = data.busy.filter(slot => slot.resource === id).map(interval);
    output.textContent = slots.length ? "Rezervované časy: " + slots.join(", ") : "Na tento deň zatiaľ nie sú rezervované časy.";
  } catch {
    if (current()) output.textContent = "Rezervované časy sa nepodarilo načítať.";
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
    (archived !== undefined ? '<input type="hidden" name="archived" value="' + e(archived) + '">' : ""),"Potvrdiť"));
}

async function mutate(action, record) {
  const result = await api(endpoint(),{action,record});
  if (action === "reservation.create") state.date = record.date;
  if (action === "tenant.rename") state.account = await api("account");
  await refresh({quiet:true});
  const invite = action === "invite.send";
  tell(invite ? (result.delivery === "sent" ? "Pozvánka bola odoslaná." : "Pozvánka sa uložila. E-mail zlyhal, môžete ho poslať znova.") :
    action === "reservation.create" ? "Rezervácia je potvrdená." : "Zmena bola uložená.", invite && result.delivery !== "sent");
}
function fileData(file) {
  if (!file?.size) return Promise.resolve("");
  if (file.size > 3 * 1024 * 1024) throw new Error("Nahrajte obrázok do 3 MB.");
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Súbor sa nepodarilo prečítať."));
    reader.onload = () => resolve(String(reader.result).split(",",2)[1]);
    reader.readAsDataURL(file);
  });
}
async function guestSubmit(action, data) {
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
    else if (key === "account/tenants") {
      const result = await api(key,values);
      state.data = null;
      state.office = ""; state.kind = ""; state.plan = ""; state.date = "";
      setAccount(result,result.id); state.view = "book"; history.replaceState(null,"","#book");
      await refresh();
      dialog.close();
      tell("Pracovisko bolo vytvorené.");
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
    case "kind": state.kind = kind; render(); root.querySelector('.segments [aria-pressed="true"]')?.focus(); break;
    case "menu": state.mobile = !state.mobile; render(); root.querySelector(state.mobile ? '#sidebar nav a' : '.mobile-only')?.focus(); break;
    case "logout":
      api("auth/logout",{}).then(() => { ++state.request; state.account = null; state.data = null; state.tenant = ""; state.mode = "login"; state.date = ""; state.office = ""; state.kind = ""; state.plan = ""; state.mobile = false; history.replaceState(null,"",mobileAdmin ? "?mobileAdmin=1#admin" : "./"); render(); if (mobileAdmin) reportMobileAdminClosed(); }).catch(error => tell(error.message,true));
      break;
  }
});
document.addEventListener("change",event => {
  const element = event.target, filter = element.dataset.filter;
  if (filter === "tenant" && state.account.tenants.some(t => t.id === element.value)) {
    state.tenant = element.value; local.set(state.tenant); state.data = null; state.date = ""; state.office = ""; state.plan = ""; state.kind = "";
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
    history.replaceState(null,"","./");
    ++state.request; state.account = null; state.data = null; state.tenant = ""; state.date = "";
    state.office = ""; state.plan = ""; state.kind = ""; state.mobile = false;
    state.view = "book"; state.loading = true; render();
    try { state.link = await api("auth/link",{token:raw}); state.token = raw; state.mode = "link"; }
    catch (error) { state.mode = "error"; state.entry = error.message; }
    state.loading = false; render(); return;
  }
  if (location.hash === "#signup") state.mode = "signup";
  try { setAccount(await api("account")); }
  catch (error) { if (error.status !== 401) { state.mode = "error"; state.entry = error.message; } }
  if (state.account) await refresh();
  else { state.loading = false; render(); }
}
start();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
