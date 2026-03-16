import { Database } from "bun:sqlite";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS gardens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS seasons (
  id TEXT PRIMARY KEY,
  garden_id TEXT NOT NULL REFERENCES gardens(id),
  year INTEGER NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','active','completed')),
  last_frost_date TEXT,
  first_frost_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('raised_bed','tray','container','row_bed','shelf','hardening_area')),
  layout_mode TEXT NOT NULL DEFAULT 'none' CHECK(layout_mode IN ('square_foot_grid','rows','cell_grid','none')),
  width REAL,
  length REAL,
  unit TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plantings (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id),
  catalog_id TEXT REFERENCES catalog_entries(id),
  space_id TEXT REFERENCES spaces(id),
  crop TEXT NOT NULL,
  variety TEXT,
  source_type TEXT NOT NULL DEFAULT 'seed' CHECK(source_type IN ('seed','start')),
  source TEXT,
  stage TEXT NOT NULL DEFAULT 'planned' CHECK(stage IN ('planned','seeded_indoors','seedling','hardening_off','direct_sown','transplanted','producing','finished','failed')),
  health TEXT NOT NULL DEFAULT 'healthy' CHECK(health IN ('healthy','watch','stressed','pest_issue','diseased','dead')),
  quantity REAL,
  quantity_unit TEXT,
  grid_squares INTEGER,
  started_at TEXT,
  hardened_at TEXT,
  transplanted_at TEXT,
  target_start_date TEXT,
  target_harden_date TEXT,
  target_transplant_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS catalog_entries (
  id TEXT PRIMARY KEY,
  crop TEXT NOT NULL,
  variety TEXT NOT NULL,
  vendor TEXT,
  url TEXT,
  source_type TEXT DEFAULT 'seed' CHECK(source_type IN ('seed','start')),
  days_to_maturity INTEGER,
  start_indoors_weeks INTEGER,
  min_night_temp INTEGER,
  spacing_inches INTEGER,
  plants_per_square INTEGER DEFAULT 1,
  sun TEXT CHECK(sun IS NULL OR sun IN ('full_sun','part_sun','shade')),
  growth_habit TEXT,
  grid_squares INTEGER,
  tags TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(crop, variety)
);

CREATE TABLE IF NOT EXISTS catalog_reviews (
  id TEXT PRIMARY KEY,
  catalog_id TEXT NOT NULL REFERENCES catalog_entries(id) ON DELETE CASCADE,
  season_id TEXT NOT NULL REFERENCES seasons(id),
  planting_id TEXT REFERENCES plantings(id),
  rating INTEGER CHECK(rating IS NULL OR (rating >= 1 AND rating <= 5)),
  yield_notes TEXT,
  would_grow_again INTEGER,
  review TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(catalog_id, season_id)
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id),
  planting_id TEXT REFERENCES plantings(id),
  space_id TEXT REFERENCES spaces(id),
  type TEXT NOT NULL CHECK(type IN ('created','seeded','transplanted','observed','harvested','task_completed','health_changed','stage_changed','note')),
  happened_at TEXT NOT NULL,
  summary TEXT NOT NULL,
  data_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS grid_placements (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  planting_id TEXT NOT NULL REFERENCES plantings(id) ON DELETE CASCADE,
  row INTEGER NOT NULL,
  col INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(space_id, row, col)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id),
  planting_id TEXT REFERENCES plantings(id),
  space_id TEXT REFERENCES spaces(id),
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'other' CHECK(type IN ('seed_start','transplant','check','harvest','maintenance','other')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done','skipped')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
  due_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
`;

export function initializeSchema(db: Database): void {
  db.exec(SCHEMA_SQL);
}
