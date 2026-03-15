import { getDb, readConfig, writeConfig } from "../db/connection";
import * as repo from "../db/repo";
import { TendError } from "../services/errors";

export function seasonCreate(opts: { name: string; year: number; lastFrost?: string; firstFrost?: string }): void {
  const db = getDb();
  const config = readConfig();
  const season = repo.createSeason(db, {
    gardenId: config.defaultGardenId,
    year: opts.year,
    name: opts.name,
    lastFrostDate: opts.lastFrost,
    firstFrostDate: opts.firstFrost,
  });
  console.log(`Created season: ${season.name} (${season.id})`);
}

export function seasonUse(seasonId: string): void {
  const db = getDb();
  const season = repo.getSeason(db, seasonId);
  if (!season) throw new TendError("NOT_FOUND", `Season '${seasonId}' not found`);
  const config = readConfig();
  config.defaultSeasonId = seasonId;
  writeConfig(config);
  console.log(`Switched to season: ${season.name} (${season.id})`);
}

export function seasonList(json: boolean): void {
  const db = getDb();
  const config = readConfig();
  const seasons = repo.listSeasons(db, config.defaultGardenId);
  if (json) {
    console.log(JSON.stringify(seasons, null, 2));
  } else {
    if (seasons.length === 0) {
      console.log("No seasons found.");
      return;
    }
    for (const s of seasons) {
      const active = s.id === config.defaultSeasonId ? " (active)" : "";
      console.log(`  ${s.name} [${s.status}] ${s.id}${active}`);
    }
  }
}
