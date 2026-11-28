export const roles = { owner: "Vlastník", admin: "Správca", member: "Člen" };
export const kinds = { desk: "Pracovný stôl", room: "Zasadačka", parking: "Parkovacie miesto" };
export const typePlural = { desk: "Pracovné stoly", room: "Zasadačky", parking: "Parkovacie miesta" };
export const visitStates = { expected: "Očakávaná", arrived: "V budove", departed: "Ukončená" };
const sprites = {
  reserve: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m5 5h2m4 0h2"/>',
  people: '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2m0-18a4 4 0 0 1 0 8m6 10v-2a4 4 0 0 0-3-4"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15"/>',
  office: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10 21v-3h4v3"/>',
  desk: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  room: '<path d="M20 21V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16m-3 0h18M9 21V6l7 2v13m-4-8h.01"/>',
  parking: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  logout: '<path d="M11 4H5v16h6m-2-8h12m-4-4 4 4-4 4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  location: '<path d="M20 10c0 5-8 10-8 10S4 15 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  invite: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="m10 3-.7 3L6 7 3 6l-1 4 3 2 1 3-1 3 3 2 3-2 3 1 2 2 3-2-1-3 2-3 2-1-1-4-3-1-2-2V3z"/>',
};
export const e = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
export const svg = (name, size = 19) => '<svg aria-hidden="true" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">' + (sprites[name] || sprites.office) + '</svg>';
export const brand = () => '<div class="brand"><img src="./favicon.svg" alt="" width="39" height="39"><span>corpo<em>.</em><small>WORKPLACE</small></span></div>';
export const button = (label, action, symbol, classes = "secondary", attrs = "") =>
  '<button type="button" class="btn ' + classes + '" data-action="' + e(action) + '" ' + attrs + '>' + (symbol ? svg(symbol, 17) : "") + e(label) + "</button>";
export const linkAttrs = (value) => 'data-id="' + e(value) + '"';
export const option = (value, label, selected = "") => '<option value="' + e(value) + '"' + (selected === value ? " selected" : "") + ">" + e(label) + "</option>";
export const options = (items, selected) => items.map(item => option(item.id, item.name, selected)).join("");
export const input = (label, name, attrs = "") => '<label class="field"><span>' + e(label) + '</span><input name="' + e(name) + '" ' + attrs + "></label>";
export const select = (label, name, values, attrs = "") => '<label class="field"><span>' + e(label) + '</span><select aria-label="' + e(label) + '" name="' + e(name) + '" ' + attrs + '>' + values + '</select></label>';
export const header = (title, copy, action = "") => '<header class="page-head"><div><h1>' + e(title) + '</h1><p>' + e(copy) + '</p></div>' + action + "</header>";
export const chip = (label, kind = "") => '<span class="chip ' + kind + '">' + e(label) + '</span>';
export const empty = (symbol, title, copy, action = "") => '<div class="empty"><span class="tile">' + svg(symbol, 23) + '</span><h2>' + e(title) + '</h2><p>' + e(copy) + '</p>' + action + '</div>';
export const panel = (title, copy, content, action = "") => '<section class="panel"><header class="panel-head"><div><h2>' + e(title) + '</h2>' + (copy ? '<p>' + e(copy) + '</p>' : '') + '</div>' + action + '</header>' + content + '</section>';
export const row = (symbol, title, subtitle, actions = "", label = "") => '<li class="line"><span class="tile ' + e(symbol) + '">' + svg(symbol) + '</span><div class="row-copy"><strong>' + e(title) + '</strong><span>' + e(subtitle) + '</span></div>' + label + '<div class="line-actions">' + actions + '</div></li>';
export const list = (contents, absent = "Žiadne záznamy.") => contents.length ? '<ul class="lines">' + contents.join("") + '</ul>' : '<p class="quiet empty-line">' + e(absent) + '</p>';
export const submit = (label) => '<p class="form-error" role="alert" hidden></p><button class="btn primary" type="submit">' + e(label) + '</button>';
export const form = (id, contents, label, attrs = "") => '<form data-form="' + e(id) + '" ' + attrs + '>' + contents + '<footer class="form-actions">' + button("Späť", "close") + submit(label) + "</footer></form>";
export const shortDate = (day) => new Intl.DateTimeFormat("sk-SK", {day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(day + "T12:00:00Z"));
export const planUrl = (tenant, plan) => "./api/tenant/" + encodeURIComponent(tenant) + "/plan/" + encodeURIComponent(plan);
export function planImage(tenant, plan, resources, label = "", edit = false) {
  const pins = resources.filter(r => r.plan === plan && !r.disabled && Number.isFinite(r.x) && Number.isFinite(r.y));
  const markers = pins.map(r => '<button class="pin ' + r.kind + '" aria-label="' + e(r.name) + '" type="button" style="--x:' + r.x + '%;--y:' + r.y + '%" data-action="book" ' + linkAttrs(r.id) + '>' + svg(r.kind, 15) + '</button>').join("");
  return '<div class="pinboard" ' + (edit ? 'data-pin-edit' : '') + '><img src="' + planUrl(tenant, plan) + '" alt="' + e(label || "Pôdorys pracoviska") + '" draggable="false">' + markers + '</div>';
}
