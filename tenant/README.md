# Firemné účty a rezervácie

Firemná verzia beží na `/corpo/app/`. Registrácia odošle overovací odkaz. Po jeho potvrdení si správca zvolí heslo a stane sa vlastníkom firmy. Pozvanému členovi príde jednorazový odkaz platný sedem dní.

- Vlastník spravuje správcov aj členov. Správca spravuje členov, skupiny, kancelárie, pôdorysy, návštevy a rezervácie vo svojej firme.
- Kancelária môže mať viac pôdorysov kancelárie alebo parkoviska. Správca nahrá PNG, JPEG alebo WebP do 3 MB a pri úprave miesta označí polohu na obrázku.
- Rezervovateľný priestor môže byť prístupný celej firme alebo jednej skupine. Stoly, zasadačky a parkovacie miesta používajú spoločnú kontrolu časových kolízií.
- Člen vidí dostupné priestory a vlastné rezervácie. Správca vidí rezervácie svojej firmy na vybraný deň. Časy rezervácií používajú pásmo Europe/Bratislava.

## Lokálny vývoj

Spustite z koreňa repozitára s Pythonom 3.12+:

```powershell
python -m pip install -r tenant/requirements.txt --target work/tenant-deps
$env:PYTHONPATH = "work/tenant-deps"
$env:CORPO_MAIL_OUTBOX = "work/mail"
python -m tenant.server
```

Otvorte `http://127.0.0.1:8770/corpo/app/`. Pozvánky a overovacie odkazy sa v tomto režime ukladajú vo formáte `.eml`. Testy spustíte príkazom `python -m unittest discover -s tenant/tests -v`. Testy používajú dočasnú databázu a lokálny poštový výstup.

## Nasadenie

Služba `corpo-workplace` je dostupná cez Nginx a počúva lokálne na porte 8770. Nasadenie používa zdrojový kód v `tenant/`, Python balíky pre cieľový systém podľa `requirements.txt`, vstupnú stránku a statické súbory dema. Skript `deploy/install.sh` zálohuje konfiguráciu pri prvom nasadení a sprístupňuje podporovanú verziu cez symbolický odkaz `current`.

Produkčné premenné sú v `/etc/corpo-workplace.env` s prístupom pre root. Poštu odosiela samostatný poštový účet Mailu. Zálohujte databázu cez SQLite online backup aj konfiguračný súbor. Dáta pôvodného súkromného dema na Sites sú v jeho vlastnej databáze.

## Zabezpečenie a integrácie

Vlastník a správcovia firmy majú v časti **Nastavenia firmy → Zabezpečenie a integrácie** tri predvolene vypnuté voľby. Zmeny potvrdzuje heslom Corpo. Na serveri sa šifrované údaje ukladajú pomocou kľúča Fernet v premennej `CORPO_SECURITY_KEY`. Tento kľúč zálohujte spolu s databázou.

- **Microsoft Entra SSO.** V Microsoft Entra zaregistrujte aplikáciu pre účty v jednom adresári. Do platformy **Web** zadajte adresu presmerovania z nastavení Corpo a pridajte delegované povolenie Microsoft Graph `User.Read`. Do Corpo vložte ID adresára, ID aplikácie a hodnotu tajného kľúča. Zdieľajte identifikátor firmy zo stránky zabezpečenia s členmi. Člen sa prvýkrát prihlási do Corpo heslom a v časti **Zabezpečenie účtu** prepojí svoj Microsoft účet. Prihlásenie cez tento účet sprístupní danú firmu. Prihlásenie heslom ostáva k dispozícii.
- **Active Directory.** Táto voľba umožní prihlásenie členov, ktorých účty synchronizujete z lokálneho AD do Microsoft Entra ID. Vyžaduje zapnuté SSO, nastavenú synchronizáciu na strane Microsoftu a existujúce členstvo v Corpo.
- **MFA.** Po zapnutí aplikácia vyžaduje časový kód z overovacej aplikácie pri prístupe do firmy. Pri prvom nastavení člen overí svoj e-mail, pridá kľúč do overovacej aplikácie a dostane osem jednorazových obnovovacích kódov. Overenie relácie platí 12 hodín.

Anglický katalóg upravujte v `tenant/web/en.json` a potom spustite `node scripts/sync-languages.mjs` z koreňa repozitára.
