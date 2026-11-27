# Corpo Workplace

Corpo je modulárna webová aplikácia na rezervovanie pracovných stolov a zasadačiek, prezeranie osobného kalendára a evidenciu návštev. Obsahuje ukážkové pracoviská Bratislava HQ a Košice Hub.

- `public/workspace/` obsahuje používateľské rozhranie v natívnom JavaScripte a CSS.
- `public/workspace/data.js` obsahuje katalóg kancelárií, podlaží, stolov a zasadačiek.
- `app/api/workplace/route.ts` je serverové API. Databázová schéma je v `db/schema.ts` a migrácie v `drizzle/`.
- `landing/` obsahuje prezentačnú stránku pre VPS. Pri nasadení do jej koreňa pridajte `favicon.svg`, `images/bratislava-office.jpg` a celý adresár `workspace/` z `public/`. Náhľad pracoviska už je v `landing/images/`.

## Spustenie dema

```powershell
python -m http.server 8080 --bind 127.0.0.1 --directory public
```

Otvorte `http://127.0.0.1:8080/workspace/demo.html`. Demo používa fiktívne údaje a ukladá zmeny v prehliadači.

## Spustenie so zdieľanými dátami

Použite Node.js 22.13 alebo novší a npm. Príkazy spustite v koreňovom adresári projektu:

```powershell
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_fat_chamber.sql
npm run dev
```

Migráciu aplikujte raz pre novú lokálnu databázu. Vývojový režim používa simulované prihlásenie. Hostovaná aplikácia získava identitu zo Sites a používa databázu D1. Zamestnanci vidia obsadené časové intervaly a svoje názvy rezervácií. Každý používateľ spravuje návštevy, ktoré zaevidoval.

## Pridanie modulu

1. V `public/workspace/modules/` vytvorte modul s položkami `id`, `title`, `icon`, `group` a funkciou `render(context)`. Ako príklad poslúži `settings.js`. Používateľské hodnoty pri skladaní HTML ošetrite funkciou `esc` z `components.js`.
2. Importujte modul do `public/workspace/registry.js` a pridajte ho do zoznamu `modules`. Registrácia vytvorí navigačný odkaz aj trasu. Na zobrazenie prepínača v nastaveniach pridajte `configurable: true` a `description`.
3. Tlačidlá s vlastným `data-action` môže obslúžiť objekt `actions` modulu. Obsluha dostane element, kontext a funkciu na prekreslenie obsahu. Ak modul potrebuje serverové dáta, pridajte jeho API a migráciu do `db/schema.ts` a spustite `npm run db:generate`.

Ilustračná fotografia pracoviska pochádza zo StockCake (CC0).
