import english from "./en.json";

export type Language = "sk" | "en";
const translations: Record<string,string> = english;
let selected:Language = "sk";
export function setLanguage(language:Language) { selected = language; }
export function language() { return selected; }
export function t(text:string) {
  return selected === "en" && Object.prototype.hasOwnProperty.call(translations,text) ? translations[text] : text;
}
export function languageLocale() { return selected === "en" ? "en-GB" : "sk-SK"; }
