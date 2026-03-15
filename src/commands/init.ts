import { createDb, writeConfig, TEND_DIR, CONFIG_PATH } from "../db/connection";
import * as repo from "../db/repo";
import { existsSync } from "fs";

export function initCommand(opts: { name?: string; year?: number; lastFrost?: string; firstFrost?: string; force?: boolean }): void {
  if (existsSync(CONFIG_PATH) && !opts.force) {
    console.error("Tend is already initialized. Use --force to reinitialize (this will create a new garden).");
    process.exit(1);
  }

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
  if (opts.lastFrost) console.log(`  Last frost: ${opts.lastFrost}`);
  if (opts.firstFrost) console.log(`  First frost: ${opts.firstFrost}`);
}
