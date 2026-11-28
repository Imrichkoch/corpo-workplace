import { language, languageSwitcher, t } from "./workspace/i18n.js";

document.querySelector("#landing-language").innerHTML = languageSwitcher();
document.title = t(document.title);
const description = document.querySelector('meta[name="description"]');
description.content = t(description.content);
for (const element of document.querySelectorAll("[data-copy]")) element.textContent = t(element.textContent);
for (const element of document.querySelectorAll("[data-copy-alt]")) element.alt = t(element.alt);
for (const element of document.querySelectorAll("[data-copy-label]")) element.setAttribute("aria-label",t(element.getAttribute("aria-label")));
for (const link of document.querySelectorAll('a[href^="./app/"],a[href^="./workspace/demo.html"]')) {
  const url = new URL(link.href);
  url.searchParams.set("lang",language);
  link.href = url.pathname + url.search + url.hash;
}
