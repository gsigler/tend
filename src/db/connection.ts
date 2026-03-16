import { Database } from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync, existsSync } from "fs";
import { initializeSchema } from "./schema";

const TEND_DIR = join(homedir(), ".tend");
const DB_PATH = join(TEND_DIR, "tend.db");
const CONFIG_PATH = join(TEND_DIR, "config.json");

export { TEND_DIR, DB_PATH, CONFIG_PATH };

export function ensureTendDir(): void {
  if (!existsSync(TEND_DIR)) {
    mkdirSync(TEND_DIR, { recursive: true });
  }
}

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;
  if (!existsSync(DB_PATH)) {
    throw new Error("Tend is not initialized. Run `tend init` first.");
  }
  _db = new Database(DB_PATH);
  _db.exec("PRAGMA journal_mode=WAL");
  _db.exec("PRAGMA foreign_keys=ON");
  return _db;
}

export function createDb(): Database {
  ensureTendDir();
  _db = new Database(DB_PATH);
  _db.exec("PRAGMA journal_mode=WAL");
  _db.exec("PRAGMA foreign_keys=ON");
  initializeSchema(_db);
  return _db;
}

export interface TendConfig {
  defaultGardenId: string;
  defaultSeasonId: string;
  units: "imperial" | "metric";
}

export function readConfig(): TendConfig {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error("Tend is not initialized. Run `tend init` first.");
  }
  const raw = Bun.file(CONFIG_PATH);
  // Use sync read
  const text = require("fs").readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(text) as TendConfig;
}

export function writeConfig(config: TendConfig): void {
  ensureTendDir();
  require("fs").writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}
