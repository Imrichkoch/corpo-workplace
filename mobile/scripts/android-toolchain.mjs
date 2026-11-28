import { readFileSync, writeFileSync } from "node:fs";

const settings = new URL("../node_modules/@react-native/gradle-plugin/settings.gradle.kts", import.meta.url);
const version = 'id("org.gradle.toolchains.foojay-resolver-convention").version("0.5.0")';
const updated = 'id("org.gradle.toolchains.foojay-resolver-convention").version("1.0.0")';

// React Native 0.83 ships an older resolver that references a vendor removed in Gradle 9.
const source = readFileSync(settings, "utf8");
if (source.includes(version)) writeFileSync(settings, source.replace(version, updated));
