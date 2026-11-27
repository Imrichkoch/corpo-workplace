import { icon } from "../icons.js";
import { bookingOrder, formatDate, people } from "../data.js";
import { avatar, bookingRows, button, esc, nav, pageHeader } from "../components.js";

function metric(label, value, detail, symbol, color) {
  return '<article class="metric"><div class="metric-top"><span class="tile ' + color + '">' + icon(symbol, 19) + '</span><h2>' + label + '</h2></div><div class="metric-value">' + value + '</div><p>' + detail + '</p></article>';
}
function progress(label, used, total, color) {
  const value = total ? Math.round(100 * used / total) : 0;
  return '<div class="progress-row"><div><span>' + label + '</span><strong>' + used + ' / ' + total + '</strong></div><div class="progress-track"><span class="' + color + '" style="width:' + value + '%"></span></div></div>';
}
export const overview = {
  id: "overview", title: "Prehľad", icon: "grid", group: "Pracovný priestor",
  render({ state, office, resources, bookings, today, visible }) {
    const daily = bookings.filter((item) => item.date === today);
    const used = new Set(daily.map((item) => item.resource));
    const desks = resources.filter((r) => r.type === "desk");
    const rooms = resources.filter((r) => r.type === "room");
    const deskCount = desks.filter((r) => used.has(r.id)).length;
    const roomCount = rooms.filter((r) => used.has(r.id)).length;
    const visits = state.data.visits.filter((item) => item.office === office.id && item.date === today);
    const upcoming = bookings.filter((item) => item.mine && item.date >= today).sort(bookingOrder).slice(0, 3);
    const firstName = state.data.profile.name.includes("@") ? "" : state.data.profile.name.split(" ")[0];
    const date = formatDate(today, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const activePeople = state.data.profile.demo ? people.filter((p) => daily.some((booking) => booking.person === p.name)) : [];
    const attendeeCount = state.data.attendeeCount?.[today]?.[office.id] ?? new Set(daily.map((booking) => booking.person || (booking.mine ? state.data.profile.name : "")).filter(Boolean)).size;
    const bookingAction = visible("desks") || visible("rooms");
    return '<div class="welcome"><div class="date-line">' + icon("calendar", 16) + esc(date) + '</div>' +
      pageHeader(firstName ? "Dobrý deň, " + firstName + "!" : "Dobrý deň!", "Tu je prehľad vášho pracoviska na dnes.", bookingAction ? button("Nová rezervácia", "new-booking", "plus", "primary") : "") + '</div>' +
      '<section class="office-hero ' + (office.id === "kosice" ? "alternate" : "") + '"><div class="hero-photo"></div><div class="hero-copy"><div class="hero-location">' + icon("pin", 15) + esc(office.detail) + '</div><h2>' + esc(office.name) + '</h2><p>Naplánujte si deň v kancelárii.<br>Vyberte si stôl alebo miestnosť na stretnutie.</p><div class="hero-actions">' +
      (visible("desks") ? nav("Nájsť stôl", "desks", "button hero-primary") : "") +
      (visible("rooms") ? nav("Pozrieť zasadačky", "rooms", "button hero-secondary") : "") +
      '</div></div></section>' +
      '<div class="metric-grid">' +
      metric("Voľné pracovné stoly", desks.length - deskCount, "z " + desks.length + " stolov bez rezervácie na dnes", "desk", "mint") +
      metric("Voľné zasadačky", rooms.length - roomCount, "z " + rooms.length + " zasadačiek bez rezervácie na dnes", "rooms", "sky") +
      metric("Dnešné návštevy", visits.length, visits.filter((item) => item.status === "arrived").length + " už v budove", "users", "peach") +
      '</div><div class="dashboard-grid"><section class="panel reservations"><header class="panel-heading"><div><h2>Najbližšie rezervácie</h2><p>Váš plán v tejto kancelárii</p></div>' +
      (visible("calendar") ? nav("Zobraziť kalendár", "calendar") : "") + '</header>' + bookingRows(upcoming, today) + '</section>' +
      '<section class="panel occupancy"><header class="panel-heading"><div><h2>Obsadenosť dnes</h2><p>Rezervované priestory</p></div><span class="tile mint small">' + icon("building", 18) + '</span></header>' +
      progress("Pracovné stoly", deskCount, desks.length, "") + progress("Zasadačky", roomCount, rooms.length, "muted") +
      '<div class="team-line">' + (activePeople.length ? '<div class="avatar-stack">' + activePeople.slice(0, 3).map((p) => avatar(p.name, p.color)).join("") + '</div>' : '<span class="tile small sky">' + icon("users", 16) + '</span>') +
      '<div><strong>' + (attendeeCount || "0") + ' s rezerváciou</strong><span>Podľa dnešných rezervácií</span></div></div></section></div>';
  },
};
