const LOCATION_KEY = "corpo.language";
let stored;
try { stored = localStorage.getItem(LOCATION_KEY); } catch {}
const requested = new URLSearchParams(location.search).get("lang");
export const language = requested === "sk" || requested === "en" ? requested : stored === "en" ? "en" : "sk";
try { localStorage.setItem(LOCATION_KEY, language); } catch {}
document.documentElement.lang = language;

let english = {};
if (language === "en") {
  try {
    const response = await fetch(new URL("./en.json", import.meta.url));
    if (response.ok) english = await response.json();
  } catch {}
}
export const t = (text) => language === "en" && Object.hasOwn(english,text) ? english[text] : text;
export const locale = language === "en" ? "en-GB" : "sk-SK";

function href(value, hash) {
  const url = new URL(location.href);
  url.searchParams.set("lang",value);
  if (hash !== undefined) url.hash = hash;
  return (url.pathname + url.search + url.hash).replace(/[&"<>]/g, char => ({"&":"&amp;",'"':"&quot;","<":"&lt;",">":"&gt;"})[char]);
}
export function languageSwitcher(hash) {
  return '<nav class="language-switch" aria-label="' + t("Jazyk") + '">' +
    [["sk","SK","Slovenčina"],["en","EN","English"]].map(([id,short,label]) =>
      '<a href="' + href(id,hash) + '" lang="' + id + '" aria-label="' + label + '"' +
      (id === language ? ' aria-current="true"' : '') + '>' + short + '</a>'
    ).join("") + '</nav>';
}
