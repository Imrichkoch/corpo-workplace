# Corpo Workplace pre Android a iOS

Expo aplikácia používa rovnaký účet a API ako [webové pracovisko](https://raizenko.cloud/corpo/app/). V mobile si môžete vybrať firmu, rezervovať stôl, zasadačku alebo parkovacie miesto, otvoriť pôdorys a zrušiť vlastnú rezerváciu. Správa členov, skupín, kancelárií a pôdorysov sa otvára v responzívnom webovom rozhraní.

```powershell
npm ci
npm run check
npx expo start
```

Použite vývojovú zostavu kompatibilnú s Expo SDK 55. Prihlásenie do existujúceho firemného účtu je priamo v aplikácii. Nový účet a e-mailovú pozvánku potvrdíte v prehliadači.

## Android

[Stiahnuť podpísané Android APK](https://raizenko.cloud/corpo/downloads/corpo-workplace-1.0.0-android.apk). Súbor je dostupný priamo z VPS. Na aktualizácie tejto inštalácie použite rovnaký podpisový kľúč.

Na lokálnu zostavu potrebujete Android SDK, JDK 17 alebo 21 a Gradle wrapper vygenerovaný aplikáciou.

```powershell
npx expo prebuild --platform android
cd android
.\gradlew.bat :app:assembleRelease
```

Lokálny profil Expo použije testovací podpis. Distribučnú zostavu pre Google Play vytvorte pomocou profilu `production` v EAS a vlastného podpisového kľúča. Balík aplikácie je `cloud.raizenko.corpo`.

## iOS

```powershell
npx expo export --platform ios
npx eas-cli build --platform ios --profile preview
```

Export overí zostavenie iOS balíka JavaScriptu. Na inštaláciu natívnej verzie na iPhone je potrebný podpis a provisioning v Apple Developer účte. Na iPhone sa dá webové pracovisko pridať na plochu v Safari aj pred vytvorením podpísanej zostavy.
