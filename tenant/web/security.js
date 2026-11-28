import { t } from "./i18n.js";
import { button, e, form, header, input, panel } from "./ui.js";

export function securityPanel(data, mobileAdmin) {
  const { security, tenant } = data;
  if (!security) return "";
  const admin = tenant.role === "owner" || tenant.role === "admin";
  const checked = (key) => security[key] ? " checked" : "";
  const checkbox = (key, label, copy) => '<label class="security-option"><input type="checkbox" name="' + key + '"' +
    checked(key) + '><span><strong>' + e(label) + '</strong><small>' + e(copy) + '</small></span></label>';
  const policies = checkbox("sso",t("Microsoft Entra SSO"),t("Povoľte prihlásenie prepojeným účtom Microsoft.")) +
    checkbox("directory",t("Active Directory"),t("Povoľte aj účty synchronizované z lokálneho Active Directory do Microsoft Entra ID.")) +
    checkbox("mfa",t("Viacfaktorové overenie (MFA)"),t("Pri vstupe do firmy vyžadujte kód z overovacej aplikácie alebo obnovovací kód."));
  const pass = input(t("Potvrďte heslo Corpo"),"password",'type="password" required autocomplete="current-password" maxlength="128"');
  const fields = admin ? '<details' + (security.sso ? " open" : "") + '><summary>' + e(t("Nastavenie Microsoft Entra")) + '</summary>' +
    input(t("ID adresára Microsoft Entra"),"entraTenant",'maxlength="36" value="' + e(security.entraTenant) + '"') +
    input(t("ID aplikácie (klienta)"),"clientId",'maxlength="36" value="' + e(security.clientId) + '"') +
    input(t("Tajná hodnota aplikácie"),"clientSecret",'type="password" autocomplete="new-password" maxlength="2048"' +
      (security.hasSecret ? ' placeholder="' + e(t("Tajná hodnota je uložená")) + '"' : "")) +
    '<p class="quiet">' + e(t("Webová adresa presmerovania pre registráciu aplikácie v Microsoft Entra")) + ' <code class="security-value">' +
      e(new URL("./auth/entra/callback",location.href).href) + '</code></p>' +
    '<p class="quiet">' + e(t("Pridajte delegované povolenie Microsoft Graph User.Read.")) + '</p></details>' : "";
  const company = security.sso || admin ? '<p>' + e(t("Identifikátor firmy pre prihlásenie SSO")) +
    ' <code class="security-value">' + e(tenant.id) + '</code></p>' : "";
  const link = security.sso && (!mobileAdmin || security.linked)
    ? '<p>' + e(security.linked ? t("Microsoft účet je prepojený.") : t("Pred použitím SSO prepojte s pracoviskom svoj existujúci Microsoft účet.")) + '</p>' +
      (security.linked ? "" : form("security-link",pass,t("Prepojiť Microsoft účet"))) : "";
  return panel(t("Zabezpečenie a integrácie"),t("Prístup k tomuto firemnému pracovisku."),
    (admin ? form("security-save",policies + fields + pass,t("Uložiť zabezpečenie")) : "") +
    company + link + (mobileAdmin && security.sso && !security.linked ?
      '<p class="quiet">' + e(t("Prepojenie účtu otvorte v bežnom prehliadači.")) + '</p>' : ""));
}

export function mfaPanel(stage) {
  const body = { email:t("Pošlite si overovací kód na e-mail svojho účtu. Potom pridajte Corpo do overovacej aplikácie."),
    setup:t("Zadajte kód, ktorý sme poslali na váš e-mail."),
    verify:stage.secret ? t("V overovacej aplikácii vytvorte časový účet s týmto kľúčom a zadajte šesťmiestny kód.") :
      t("Zadajte šesťmiestny kód z overovacej aplikácie alebo obnovovací kód."),
    recovery:t("Uložte si obnovovacie kódy na bezpečnom mieste. Každý môžete použiť raz.") }[stage.step];
  let fields = "";
  if (stage.secret) fields += '<p><code class="security-value" aria-label="' + e(t("Kľúč aplikácie")) + '">' + e(stage.secret) + '</code></p>';
  if (stage.step === "setup" || stage.step === "verify") {
    fields += input(t("Overovací kód"),"code",'required maxlength="24" autocomplete="one-time-code" ' +
      (stage.step === "setup" || stage.secret ? 'inputmode="numeric"' : ""));
  }
  const controls = stage.step === "recovery"
    ? '<ul class="recovery-codes">' + stage.recoveryCodes.map(code => '<li><code>' + e(code) + '</code></li>').join("") +
      '</ul>' + button(t("Pokračovať do pracoviska"),"mfa-continue",null,"primary")
    : form("mfa-" + stage.step,fields,stage.step === "email" ? t("Poslať kód na e-mail") : t("Overiť kód")) +
      (stage.step === "setup" || stage.secret ? button(t("Začať znova"),"mfa-restart",null,"text") : "");
  return header(t("Viacfaktorové overenie (MFA)"),"") + '<section class="panel"><p>' + e(body) + '</p>' + controls + '</section>' ;
}
