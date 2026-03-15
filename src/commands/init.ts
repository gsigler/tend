import { createDb, writeConfig, TEND_DIR, readConfig } from "../db/connection";
import * as repo from "../db/repo";
import { existsSync } from "fs";
import { join } from "path";

export function initCommand(opts: { name?: string; year?: number; lastFrost?: string; firstFrost?: string }): void {
  const gardenName = opts.name ?? "My Garden";
  const year = opts.year ?? new Date().getFullYear();

  const db = createDb();
  const garden = repo.createGarden(db, gardenName);
  const season = repo.createSeason(db, {
    gardenId: garden.id,
    year,
    name: `Season ${year}`,
    status: "active",
    lastFrostDate: opts.lastFrost,
    firstFrostDate: opts.firstFrost,
  });

  writeConfig({
    defaultGardenId: garden.id,
    defaultSeasonId: season.id,
    units: "imperial",
  });

  console.log(`Initialized tend in ${TEND_DIR}`);
  console.log(`  Garden: ${gardenName}`);
  console.log(`  Season: ${season.name} (${season.id})`);
}
