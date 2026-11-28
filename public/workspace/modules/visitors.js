import { t } from "../i18n.js";
import { formatDate } from "../data.js";
import { avatar, button, emptyState, esc, iconButton, pageHeader } from "../components.js";

const labels = { expected: t("Očakávaná"), arrived: t("V budove"), departed: t("Ukončená") };
export const visitors = {
  id: "visitors", title: t("Návštevy"), icon: "users", group: t("Pracovný priestor"), configurable: true,
  description: t("Evidencia návštev a zaznamenávanie príchodov a odchodov."),
  render({ state, office }) {
    const list = state.data.visits.filter((item) => item.office === office.id).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const items = state.visitorFilter ? list.filter((item) => item.status === state.visitorFilter) : list;
    return pageHeader(t("Návštevy"), t("Evidujte návštevy a zaznamenajte ich príchod aj odchod."), button(t("Pridať návštevu"), "new-visit", "plus", "primary")) +
      t("<section class=\"panel visitor-panel\"><div class=\"segmented\" aria-label=\"Stav návštevy\">") +
      [["", t("Všetky")], ...Object.entries(labels)].map(([value, label]) => '<button type="button" data-action="visitor-filter" data-filter="' + value + '" aria-pressed="' + (state.visitorFilter === value) + '">' + label + '</button>').join("") +
      '</div>' + (items.length ? '<ul class="visitor-list">' + items.map((item, index) => {
        const next = item.status === "expected" ? t("Potvrdiť príchod") : item.status === "arrived" ? t("Potvrdiť odchod") : "";
        return '<li class="visitor-row">' + avatar(item.name, ["peach", "mint", "lavender"][index % 3]) + '<div class="row-copy"><strong>' + esc(item.name) + '</strong><span>' + esc(item.company || t("Návšteva")) + '</span></div><div class="visit-date">' +
          esc(formatDate(item.date) + " · " + item.time) + '</div><span class="badge ' + (item.status === "arrived" ? "green" : item.status === "expected" ? "amber" : "quiet") + '">' + labels[item.status] + '</span><div class="visit-actions">' +
          (next ? button(next, "next-visit", null, "secondary", 'data-id="' + esc(item.id) + '"') : "") +
          iconButton(t("Odstrániť návštevu"), "delete-visit", "close", 'data-id="' + esc(item.id) + '"') + '</div></li>';
      }).join("") + '</ul>' : emptyState("users", t("Žiadne návštevy"), t("V tejto skupine zatiaľ nie sú žiadne návštevy."))) + '</section>';
  },
};
