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

// Columns added in v0.1.2 — ALTER TABLE for existing databases
const MIGRATION_COLUMNS = [
  "ALTER TABLE plantings ADD COLUMN source TEXT",
  "ALTER TABLE plantings ADD COLUMN grid_squares INTEGER",
  "ALTER TABLE plantings ADD COLUMN hardened_at TEXT",
  "ALTER TABLE plantings ADD COLUMN target_start_date TEXT",
  "ALTER TABLE plantings ADD COLUMN target_harden_date TEXT",
  "ALTER TABLE plantings ADD COLUMN target_transplant_date TEXT",
];

// Migrate seed_plans rows into plantings (one-time, idempotent)
const MIGRATE_SEED_PLANS = `
INSERT INTO plantings (id, season_id, space_id, crop, variety, source_type, source, stage, health,
  quantity, grid_squares, started_at, hardened_at, transplanted_at,
  target_start_date, target_harden_date, target_transplant_date, notes, created_at, updated_at)
SELECT
  REPLACE(id, 'plan_', 'planting_'),
  season_id, space_id, crop, variety,
  CASE start_type WHEN 'direct_sow' THEN 'start' ELSE 'seed' END,
  source,
  CASE status
    WHEN 'planned' THEN 'planned'
    WHEN 'started' THEN 'seeded_indoors'
    WHEN 'hardening' THEN 'hardening_off'
    WHEN 'transplanted' THEN 'transplanted'
    WHEN 'direct_sown' THEN 'direct_sown'
    WHEN 'done' THEN 'finished'
    WHEN 'skipped' THEN 'failed'
    ELSE 'planned'
  END,
  'healthy',
  qty_to_start, grid_squares, started_at, hardened_at, transplanted_at,
  target_start_date, target_harden_date, target_transplant_date, notes, created_at, updated_at
FROM seed_plans
WHERE id NOT IN (SELECT REPLACE(id, 'planting_', 'plan_') FROM plantings)
`;

export function initializeSchema(db: Database): void {
  db.exec(SCHEMA_SQL);
  for (const sql of MIGRATION_COLUMNS) {
    try { db.exec(sql); } catch {}
  }
  // Migrate any existing seed_plans into plantings
  try { db.exec(MIGRATE_SEED_PLANS); } catch {}
}
