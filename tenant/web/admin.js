import { button, chip, e, empty, form, header, input, kinds, linkAttrs, list, option, options, panel, planImage, roles, row, select, svg } from "./ui.js";

const add = (label, type) => button(label, "open", "plus", "primary", 'data-type="' + type + '"');
const edit = (id, type, label = "Upraviť") => button(label, "open", null, "secondary small", 'data-type="' + type + '" ' + linkAttrs(id));
const change = (id, action, label, more = "") => button(label, "change", null, "secondary small", 'data-command="' + action + '" ' + linkAttrs(id) + " " + more);
const saved = (id) => id ? '<input type="hidden" name="id" value="' + e(id) + '">' : "";
const attributes = (value = "", required = true, length = 120) => 'value="' + e(value) + '" maxlength="' + length + '"' + (required ? " required" : "");
const areAdmins = (data) => data.tenant.role === "owner";

function resourceOffice(data, id) { return data.offices.find(item => item.id === id)?.name || "Kancelária"; }
function invitationStatus(item) {
  if (item.used) return ["Prijatá", "good"];
  if (item.delivery === "failed") return ["E-mail zlyhal", "warning"];
  if (item.expires < Date.now() / 1000) return ["Vypršaná", "warning"];
  if (item.delivery === "pending") return ["Odosiela sa", ""];
  return ["Odoslaná", ""];
}

const adminSections = [
  ["inventory","office","Kancelárie a priestory","Kancelárie, stoly, zasadačky a parkovacie miesta"],
  ["reservations","reserve","Správa rezervácií","Rezervácie a obsadenosť pracoviska"],
  ["plans","map","Správa pôdorysov","Nahrajte pôdorys alebo upravte označené miesta"],
  ["team","people","Ľudia a skupiny","Členovia firmy, skupiny a e-mailové pozvánky"],
  ["settings","gear","Nastavenia firmy","Názov a nastavenia pracoviska"],
];

export function adminView(view, data, { office, kind, mobileAdmin }) {
  if (view === "admin") {
    return header("Správa pracoviska",data.tenant.name) + '<div class="admin-shortcuts">' +
      adminSections.map(([id,glyph,title,copy]) =>
        '<a class="panel admin-shortcut" href="#' + id + '"><span class="tile ' + glyph + '">' + svg(glyph,20) +
        '</span><span><strong>' + title + '</strong><small>' + copy + '</small></span></a>').join("") + '</div>';
  }
  if (view === "inventory") {
    const activeOffices = data.offices.filter(o => !o.archived);
    const resources = data.resources.filter(r => ((!office || r.office === office) && (!kind || r.kind === kind)));
    return header("Kancelárie a priestory", "Spravujte pracoviská, zasadačky, stoly aj parkovacie miesta.", add("Pridať kanceláriu", "office")) +
      panel("Kancelárie", "Každá kancelária má vlastný zoznam priestorov a pôdorysov.", list(data.offices.map(o => row("office", o.name, o.address || "Bez adresy",
        edit(o.id, "office") + change(o.id, "office.archive", o.archived ? "Obnoviť" : "Archivovať", 'data-archived="' + (o.archived ? "0" : "1") + '"'),
        o.archived ? chip("Archivovaná") : "")), "Pridajte prvú kanceláriu.")) +
      panel("Rezervovateľné priestory", "Obmedzte prístup na vybranú skupinu alebo priraďte miesto na pôdorys.",
        '<div class="filters">' + select("Kancelária", "office", option("", "Všetky kancelárie", office) + options(data.offices, office), 'data-filter="office"') +
        select("Typ", "kind", option("", "Všetky typy", kind) + Object.entries(kinds).map(([key,label]) => option(key,label,kind)).join(""), 'data-filter="kind"') + '</div>' +
        list(resources.map(r => row(r.kind, r.name, [resourceOffice(data, r.office), kinds[r.kind], ...(r.kind === "room" ? [r.capacity + " osôb"] : []), data.teams.find(t => t.id === r.team)?.name].filter(Boolean).join(" · "),
          (!data.offices.find(o => o.id === r.office)?.archived ? edit(r.id,"resource") : "") + change(r.id, "resource.archive", r.archived ? "Obnoviť" : "Archivovať", 'data-archived="' + (r.archived ? "0" : "1") + '"'),
          r.disabled ? chip("Archivovaný") : "")), "Pre tento filter zatiaľ nie sú priestory."), activeOffices.length ? add("Pridať priestor", "resource") : "");
  }
  if (view === "plans") {
    return header("Správa pôdorysov", "Nahrajte pôdorys kancelárie alebo parkoviska. Polohy miest nastavíte pri úprave priestoru.", data.offices.some(o => !o.archived) ? add("Nahrať pôdorys", "plan") : add("Pridať kanceláriu", "office")) +
      (data.plans.length ? '<div class="plan-grid">' + data.plans.map(p =>
        panel(p.name, resourceOffice(data,p.office) + " · " + (p.kind === "parking" ? "Parkovisko" : "Kancelária"),
          planImage(data.tenant.id,p.id,data.resources,p.name),
          '<div class="plan-admin-actions">' +
          (data.offices.some(o => o.id === p.office && !o.archived) ? '<a class="btn secondary small" href="#map/' + e(p.id) + '">Rezervovať z mapy</a>' : "") +
          edit(p.id,"plan") + change(p.id,"plan.remove","Odstrániť") + '</div>')).join("") + "</div>" :
        empty("map","Pridajte prvý pôdorys","Obrázok môže byť vo formáte PNG, JPEG alebo WebP do 3 MB."));
  }
  if (view === "team") {
    return header("Ľudia a skupiny", "Zdieľajte pracovisko cez e-mailové pozvánky a priraďte členov do skupín.", add("Pozvať používateľa","invite")) +
      panel("Členovia", "Vlastník môže spravovať aj roly správcov.", list(data.members.map(m => {
        const mayEdit = m.role !== "owner" && (m.role !== "admin" || areAdmins(data));
        const groups = m.teams.map(id => data.teams.find(t => t.id === id)?.name).filter(Boolean);
        return row("people", m.name, [m.email,...groups].join(" · "), mayEdit ? edit(m.id,"member") + change(m.id,"member.remove","Odobrať") : "", chip(roles[m.role], m.role === "owner" ? "good" : ""));
      }))) +
      panel("Skupiny", "Člen môže patriť do viacerých skupín.", list(data.teams.map(t => row("people",t.name,data.members.filter(m => m.teams.includes(t.id)).length + " členov",
        edit(t.id,"team")+change(t.id,"team.remove","Odstrániť"))), "Zatiaľ nemáte žiadne skupiny."), add("Nová skupina","team")) +
      panel("E-mailové pozvánky", "Aktívne pozvánky možno zrušiť alebo poslať znova.", list(data.invitations.map(i => {
        const [label, style] = invitationStatus(i);
        const allowed = !i.used && (i.role === "member" || areAdmins(data));
        return row("invite", i.email, roles[i.role], allowed ? edit(i.id,"invite","Poslať znova") + change(i.id,"invite.revoke","Zrušiť") : "", chip(label,style));
      }), "Zatiaľ neboli odoslané pozvánky."));
  }
  return header("Nastavenia firmy", "Spravujte názov tohto firemného pracoviska.", mobileAdmin ? "" : add("Vytvoriť ďalšiu firmu", "tenant")) +
    panel(data.tenant.name, "Názov uvidia členovia aj pozvaní kolegov.", "", edit(data.tenant.id,"company"));
}

function searchItem(data, list, id) {
  return id ? data[list].find(item => item.id === id) : null;
}
export function officeOptions(data, value, archived = false) {
  return option("", "Vyberte kanceláriu", value) + options(data.offices.filter(o => archived || !o.archived), value);
}
function groups(data, value) { return option("", "Bez skupiny", value) + options(data.teams, value); }
function teamRoles(data, value) {
  return option("member",roles.member,value) + (areAdmins(data) ? option("admin",roles.admin,value) : "");
}
export function planOptions(data, office, kind, selected = "") {
  return option("", "Bez pôdorysu", selected) + options(data.plans.filter(p => p.office === office && p.kind === (kind === "parking" ? "parking" : "office")), selected);
}

export function adminForm(type, id, data, office) {
  switch (type) {
    case "office": {
      const item = searchItem(data,"offices",id);
      return [item ? "Upraviť kanceláriu" : "Nová kancelária", form("office.save", saved(id) +
        input("Názov kancelárie","name",attributes(item?.name)) + input("Adresa","address",attributes(item?.address,false,180)), "Uložiť kanceláriu")];
    }
    case "team": {
      const item = searchItem(data,"teams",id);
      return [item ? "Upraviť skupinu" : "Nová skupina", form("team.save", saved(id) + input("Názov skupiny","name",attributes(item?.name)), "Uložiť skupinu")];
    }
    case "company":
      return ["Názov firmy",form("tenant.rename",input("Názov firmy","name",attributes(data.tenant.name)),"Uložiť názov")];
    case "tenant":
      return ["Nové firemné pracovisko",form("account/tenants",input("Názov firmy","company",attributes()),"Vytvoriť pracovisko")];
    case "invite": {
      const item = searchItem(data,"invitations",id);
      return ["Pozvať používateľa",form("invite.send",
        input("E-mail používateľa","email",'type="email" ' + attributes(item?.email,true,254)) +
        select("Rola","role",teamRoles(data,item?.role || "member")) +
        select("Skupina","team",groups(data,item?.team || "")) +
        '<p class="quiet">Pozvánka príde e-mailom a platí 7 dní.</p>', "Odoslať pozvánku")];
    }
    case "member": {
      const item = searchItem(data,"members",id);
      if (!item) return null;
      return ["Správa používateľa",form("member.save",saved(id) +
        '<p class="quiet">' + e(item.email) + '</p>' + select("Rola","role",teamRoles(data,item.role)) +
        '<fieldset><legend>Skupiny</legend>' + (data.teams.length ? data.teams.map(t =>
          '<label class="check"><input type="checkbox" name="teams" value="' + e(t.id) + '"' + (item.teams.includes(t.id) ? ' checked' : '') + '>' + e(t.name) + '</label>').join("") :
          '<p class="quiet">Pridajte skupinu v sekcii Ľudia a skupiny.</p>') + '</fieldset>',"Uložiť používateľa")];
    }
    case "plan": {
      const item = searchItem(data,"plans",id);
      const place = item?.office || office || data.offices.find(o => !o.archived)?.id || "";
      const kind = item?.kind || "office";
      const fields = item ? '<input type="hidden" name="office" value="' + e(place) + '"><input type="hidden" name="kind" value="' + kind + '">' :
        select("Kancelária","office",officeOptions(data,place),'required') + select("Typ pôdorysu","kind",option("office","Kancelária",kind)+option("parking","Parkovisko",kind));
      return [item ? "Upraviť pôdorys" : "Nahrať pôdorys",form("plan.save", saved(id) + fields +
        input("Názov pôdorysu","name",attributes(item?.name)) +
        input(item ? "Nahradiť obrázok (voliteľné)" : "Obrázok pôdorysu","image",'type="file" accept="image/png,image/jpeg,image/webp" ' + (item ? "" : "required")) +
        '<p class="quiet">PNG, JPEG alebo WebP do 3 MB.</p>',"Uložiť pôdorys")];
    }
    case "resource": {
      const item = searchItem(data,"resources",id);
      const place = item?.office || office || data.offices.find(o => !o.archived)?.id || "";
      const kind = item?.kind || "desk";
      const fixed = item ? '<input type="hidden" name="office" value="' + e(place) + '"><input type="hidden" name="kind" value="' + e(kind) + '">' :
        '<div class="fields">' + select("Kancelária","office",officeOptions(data,place),'required data-resource-field') +
        select("Typ","kind",Object.entries(kinds).map(([k,label]) => option(k,label,kind)).join(""),'data-resource-field') + '</div>';
      return [item ? "Upraviť priestor" : "Nový rezervovateľný priestor",form("resource.save", saved(id) + fixed +
        '<div class="fields">' + input("Názov priestoru","name",attributes(item?.name)) + select("Prístup pre skupinu","team",groups(data,item?.team || "")) + '</div>' +
        input("Popis alebo vybavenie","description",attributes(item?.description,false,200)) +
        '<div data-capacity ' + (kind === "room" ? '' : 'hidden') + '>' + input("Kapacita","capacity",'type="number" min="1" max="500" value="' + (item?.capacity || 1) + '"') + '</div>' +
        select("Pôdorys","plan",planOptions(data,place,kind,item?.plan || ""),'data-resource-plan') +
        '<div data-pin-view></div><div class="fields" data-coordinates hidden>' +
        input("Poloha zľava (%)","x",'type="number" min="0" max="100" step="0.1" value="' + e(item?.x) + '"') +
        input("Poloha zhora (%)","y",'type="number" min="0" max="100" step="0.1" value="' + e(item?.y) + '"') + '</div>',"Uložiť priestor")];
    }
    default: return null;
  }
}

export function updatePinEditor(formElement, data, refill = false) {
  const elements = formElement.elements;
  if (refill) {
    const value = elements.plan.value;
    elements.plan.innerHTML = planOptions(data,elements.office.value,elements.kind.value,value);
    if (value && value !== elements.plan.value) { elements.x.value = ""; elements.y.value = ""; }
  }
  formElement.querySelector("[data-capacity]").hidden = elements.kind.value !== "room";
  const id = elements.plan.value;
  formElement.querySelector("[data-coordinates]").hidden = !id;
  elements.x.required = elements.y.required = Boolean(id);
  const view = formElement.querySelector("[data-pin-view]");
  view.innerHTML = id ? '<p class="quiet">Kliknutím do obrázka označíte polohu.</p>' +
    planImage(data.tenant.id,id,[],"Pôdorys na označenie polohy",true) : "";
  if (id) showEditorPin(formElement);
}
export function showEditorPin(formElement) {
  const board = formElement.querySelector("[data-pin-edit]");
  if (!board) return;
  board.querySelector(".pin-edit")?.remove();
  const fields = formElement.elements;
  const { x, y } = fields;
  if (x.value !== "" && y.value !== "" && x.validity.valid && y.validity.valid) {
    const marker = document.createElement("span");
    marker.className = "pin pin-edit";
    marker.style.setProperty("--x", x.value + "%");
    marker.style.setProperty("--y", y.value + "%");
    marker.setAttribute("aria-hidden","true");
    board.append(marker);
  }
}
