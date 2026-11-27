import { formatDate } from "../data.js";
import { avatar, button, emptyState, esc, iconButton, pageHeader } from "../components.js";

const labels = { expected: "Očakávaná", arrived: "V budove", departed: "Ukončená" };
export const visitors = {
  id: "visitors", title: "Návštevy", icon: "users", group: "Pracovný priestor", configurable: true,
  description: "Evidencia návštev a zaznamenávanie príchodov a odchodov.",
  render({ state, office }) {
    const list = state.data.visits.filter((item) => item.office === office.id).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const items = state.visitorFilter ? list.filter((item) => item.status === state.visitorFilter) : list;
    return pageHeader("Návštevy", "Evidujte návštevy a zaznamenajte ich príchod aj odchod.", button("Pridať návštevu", "new-visit", "plus", "primary")) +
      '<section class="panel visitor-panel"><div class="segmented" aria-label="Stav návštevy">' +
      [["", "Všetky"], ...Object.entries(labels)].map(([value, label]) => '<button type="button" data-action="visitor-filter" data-filter="' + value + '" aria-pressed="' + (state.visitorFilter === value) + '">' + label + '</button>').join("") +
      '</div>' + (items.length ? '<ul class="visitor-list">' + items.map((item, index) => {
        const next = item.status === "expected" ? "Potvrdiť príchod" : item.status === "arrived" ? "Potvrdiť odchod" : "";
        return '<li class="visitor-row">' + avatar(item.name, ["peach", "mint", "lavender"][index % 3]) + '<div class="row-copy"><strong>' + esc(item.name) + '</strong><span>' + esc(item.company || "Návšteva") + '</span></div><div class="visit-date">' +
          esc(formatDate(item.date) + " · " + item.time) + '</div><span class="badge ' + (item.status === "arrived" ? "green" : item.status === "expected" ? "amber" : "quiet") + '">' + labels[item.status] + '</span><div class="visit-actions">' +
          (next ? button(next, "next-visit", null, "secondary", 'data-id="' + esc(item.id) + '"') : "") +
          iconButton("Odstrániť návštevu", "delete-visit", "close", 'data-id="' + esc(item.id) + '"') + '</div></li>';
      }).join("") + '</ul>' : emptyState("users", "Žiadne návštevy", "V tejto skupine zatiaľ nie sú žiadne návštevy.")) + '</section>';
  },
};
