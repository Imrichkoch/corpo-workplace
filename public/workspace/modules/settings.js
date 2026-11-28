import { t } from "../i18n.js";
import { icon } from "../icons.js";
import { esc, pageHeader } from "../components.js";

export const settings = {
  id: "settings", title: t("Nastavenia"), icon: "settings", group: t("Správa"),
  render({ modules, state }) {
    return pageHeader(t("Nastavenia"), t("Prispôsobte si moduly zobrazované v tomto prehliadači.")) +
      t("<section class=\"panel settings-panel\"><header class=\"panel-heading\"><div><h2>Moduly pracoviska</h2><p>Vypnutie modulu skryje jeho položku v navigácii.</p></div></header>") +
      modules.filter((item) => item.configurable).map((item) => '<label class="module-row"><span class="tile mint">' + icon(item.icon, 19) + '</span><span class="row-copy"><strong>' + esc(item.title) + '</strong><span>' + esc(item.description) + '</span></span><input class="switch" type="checkbox" role="switch" data-change="module" value="' + item.id + '"' +
        (state.hiddenModules.includes(item.id) ? "" : " checked") + ' aria-label="' + esc(item.title) + '"></label>').join("") + '</section>';
  },
};
