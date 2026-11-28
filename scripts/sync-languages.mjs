import { copyFile } from "node:fs/promises";

const fromRoot = (file) => new URL("../" + file, import.meta.url);
await Promise.all([
  copyFile(fromRoot("tenant/web/en.json"),fromRoot("mobile/en.json")),
  copyFile(fromRoot("tenant/web/en.json"),fromRoot("public/workspace/en.json")),
  copyFile(fromRoot("public/workspace/i18n.js"),fromRoot("tenant/web/i18n.js")),
]);
