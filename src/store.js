import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SETTINGS, emptyMeta } from "./model.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const dataFile = path.join(root, "data", "db.json");

export function emptyDb() {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    positions: [],
    alerts: [],
    meta: emptyMeta()
  };
}

export function load() {
  if (!fs.existsSync(dataFile)) return emptyDb();
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  } catch {
    throw new Error("data/db.json 损坏了，没有覆盖它。可以先把这个文件改名再重启。");
  }
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
    positions: Array.isArray(parsed.positions) ? parsed.positions : [],
    alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
    meta: { ...emptyMeta(), ...(parsed.meta || {}) }
  };
}

export function save(db) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  const tmp = `${dataFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.rmSync(dataFile, { force: true });
  fs.renameSync(tmp, dataFile);
}
