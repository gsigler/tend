import { Database } from "bun:sqlite";
import { initializeSchema } from "../src/db/schema";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/** Create a fresh in-memory database with schema applied */
export function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  initializeSchema(db);
  return db;
}

/** Create a temporary ~/.tend directory for CLI integration tests */
export function createTestTendDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "tend-test-"));
  return dir;
}

/** Clean up a temporary directory */
export function cleanupDir(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}
