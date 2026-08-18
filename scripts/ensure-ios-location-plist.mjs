/**
 * Ensures iOS Info.plist has location usage strings required for geofenced clock-in.
 * Safe to run after `npx cap add ios` / `npx cap sync ios`.
 *
 * Usage: node scripts/ensure-ios-location-plist.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plistPath = path.join(root, "ios", "App", "App", "Info.plist");

const KEY = "NSLocationWhenInUseUsageDescription";
const VALUE =
  "Aumento Tracker needs your location to verify you are at an allowed work site before clock-in.";

if (!fs.existsSync(plistPath)) {
  console.log(
    `[ensure-ios-location-plist] No iOS project at ${plistPath}. Run "npx cap add ios" on a Mac first.`,
  );
  process.exit(0);
}

let plist = fs.readFileSync(plistPath, "utf8");
if (plist.includes(`<key>${KEY}</key>`)) {
  console.log(`[ensure-ios-location-plist] ${KEY} already present.`);
  process.exit(0);
}

const entry = `	<key>${KEY}</key>
	<string>${VALUE}</string>
`;

if (!plist.includes("</dict>")) {
  console.error("[ensure-ios-location-plist] Unexpected Info.plist format.");
  process.exit(1);
}

plist = plist.replace("</dict>", `${entry}</dict>`);
fs.writeFileSync(plistPath, plist, "utf8");
console.log(`[ensure-ios-location-plist] Added ${KEY} to Info.plist.`);
