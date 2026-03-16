import { Database } from "bun:sqlite";
import { genId } from "./ids";

// --- Gardens ---

export interface Garden {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export function createGarden(db: Database, name: string): Garden {
  const id = genId("garden");
  const now = new Date().toISOString();
  db.run(
    "INSERT INTO gardens (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [id, name, now, now]
  );
  return { id, name, created_at: now, updated_at: now };
}

export function getGarden(db: Database, id: string): Garden | null {
  return db.query("SELECT * FROM gardens WHERE id = ?").get(id) as Garden | null;
}

// --- Seasons ---

export interface Season {
  id: string;
  garden_id: string;
  year: number;
  name: string;
  status: string;
  last_frost_date: string | null;
  first_frost_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSeasonInput {
  gardenId: string;
  year: number;
  name: string;
  status?: string;
  lastFrostDate?: string;
  firstFrostDate?: string;
}

export function createSeason(db: Database, input: CreateSeasonInput): Season {
  const id = genId("season");
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO seasons (id, garden_id, year, name, status, last_frost_date, first_frost_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.gardenId, input.year, input.name, input.status ?? "active", input.lastFrostDate ?? null, input.firstFrostDate ?? null, now, now]
  );
  return {
    id, garden_id: input.gardenId, year: input.year, name: input.name,
    status: input.status ?? "active",
    last_frost_date: input.lastFrostDate ?? null,
    first_frost_date: input.firstFrostDate ?? null,
    created_at: now, updated_at: now,
  };
}

export function getSeason(db: Database, id: string): Season | null {
  return db.query("SELECT * FROM seasons WHERE id = ?").get(id) as Season | null;
}

export function listSeasons(db: Database, gardenId: string): Season[] {
  return db.query("SELECT * FROM seasons WHERE garden_id = ? ORDER BY year DESC").all(gardenId) as Season[];
}

// --- Spaces ---

export interface Space {
  id: string;
  season_id: string;
  name: string;
  type: string;
  layout_mode: string;
  width: number | null;
  length: number | null;
  unit: string | null;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSpaceInput {
  seasonId: string;
  name: string;
  type: string;
  layoutMode?: string;
  width?: number;
  length?: number;
  unit?: string;
  notes?: string;
}

export function createSpace(db: Database, input: CreateSpaceInput): Space {
  const id = genId("space");
  const now = new Date().toISOString();
  const maxOrder = db.query("SELECT COALESCE(MAX(sort_order), 0) as m FROM spaces WHERE season_id = ?").get(input.seasonId) as { m: number };
  db.run(
    `INSERT INTO spaces (id, season_id, name, type, layout_mode, width, length, unit, sort_order, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.seasonId, input.name, input.type, input.layoutMode ?? "none", input.width ?? null, input.length ?? null, input.unit ?? null, maxOrder.m + 1, input.notes ?? null, now, now]
  );
  return {
    id, season_id: input.seasonId, name: input.name, type: input.type,
    layout_mode: input.layoutMode ?? "none",
    width: input.width ?? null, length: input.length ?? null, unit: input.unit ?? null,
    sort_order: maxOrder.m + 1, notes: input.notes ?? null,
    created_at: now, updated_at: now,
  };
}

export function listSpaces(db: Database, seasonId: string): Space[] {
  return db.query("SELECT * FROM spaces WHERE season_id = ? ORDER BY sort_order").all(seasonId) as Space[];
}

export function getSpaceByName(db: Database, seasonId: string, name: string): Space | null {
  return db.query("SELECT * FROM spaces WHERE season_id = ? AND name = ?").get(seasonId, name) as Space | null;
}

export function getSpace(db: Database, id: string): Space | null {
  return db.query("SELECT * FROM spaces WHERE id = ?").get(id) as Space | null;
}

// --- Plantings ---

export interface Planting {
  id: string;
  season_id: string;
  space_id: string | null;
  crop: string;
  variety: string | null;
  source_type: string;
  source: string | null;
  stage: string;
  health: string;
  quantity: number | null;
  quantity_unit: string | null;
  grid_squares: number | null;
  started_at: string | null;
  hardened_at: string | null;
  transplanted_at: string | null;
  target_start_date: string | null;
  target_harden_date: string | null;
  target_transplant_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePlantingInput {
  seasonId: string;
  spaceId?: string;
  crop: string;
  variety?: string;
  sourceType?: string;
  source?: string;
  stage?: string;
  quantity?: number;
  quantityUnit?: string;
  gridSquares?: number;
  startedAt?: string;
  targetStartDate?: string;
  targetHardenDate?: string;
  targetTransplantDate?: string;
  notes?: string;
}

export function createPlanting(db: Database, input: CreatePlantingInput): Planting {
  const id = genId("planting");
  const now = new Date().toISOString();
  const stage = input.stage ?? "planned";
  const transplantedAt = stage === "transplanted" ? (input.startedAt ?? now) : null;
  db.run(
    `INSERT INTO plantings (id, season_id, space_id, crop, variety, source_type, source, stage, health, quantity, quantity_unit, grid_squares, started_at, hardened_at, transplanted_at, target_start_date, target_harden_date, target_transplant_date, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.seasonId, input.spaceId ?? null, input.crop, input.variety ?? null, input.sourceType ?? "seed", input.source ?? null, stage, "healthy", input.quantity ?? null, input.quantityUnit ?? null, input.gridSquares ?? null, input.startedAt ?? null, null, transplantedAt, input.targetStartDate ?? null, input.targetHardenDate ?? null, input.targetTransplantDate ?? null, input.notes ?? null, now, now]
  );
  return {
    id, season_id: input.seasonId, space_id: input.spaceId ?? null,
    crop: input.crop, variety: input.variety ?? null,
    source_type: input.sourceType ?? "seed", source: input.source ?? null,
    stage, health: "healthy",
    quantity: input.quantity ?? null, quantity_unit: input.quantityUnit ?? null,
    grid_squares: input.gridSquares ?? null,
    started_at: input.startedAt ?? null, hardened_at: null, transplanted_at: transplantedAt,
    target_start_date: input.targetStartDate ?? null,
    target_harden_date: input.targetHardenDate ?? null,
    target_transplant_date: input.targetTransplantDate ?? null,
    notes: input.notes ?? null, created_at: now, updated_at: now,
  };
}

export function listPlantings(db: Database, seasonId: string, filters?: { spaceId?: string; stage?: string; crop?: string }): Planting[] {
  let sql = "SELECT * FROM plantings WHERE season_id = ?";
  const params: any[] = [seasonId];
  if (filters?.spaceId) { sql += " AND space_id = ?"; params.push(filters.spaceId); }
  if (filters?.stage) { sql += " AND stage = ?"; params.push(filters.stage); }
  if (filters?.crop) { sql += " AND crop = ?"; params.push(filters.crop); }
  sql += " ORDER BY created_at DESC";
  return db.query(sql).all(...params) as Planting[];
}

export function getPlanting(db: Database, id: string): Planting | null {
  return db.query("SELECT * FROM plantings WHERE id = ?").get(id) as Planting | null;
}

export function findPlanting(db: Database, seasonId: string, idOrCrop: string): Planting | null {
  // Try by ID first
  const byId = getPlanting(db, idOrCrop);
  if (byId) return byId;
  // Then by crop name (returns first match)
  return db.query("SELECT * FROM plantings WHERE season_id = ? AND crop = ? ORDER BY created_at DESC LIMIT 1").get(seasonId, idOrCrop) as Planting | null;
}

export function deletePlanting(db: Database, id: string): void {
  db.run("DELETE FROM events WHERE planting_id = ?", [id]);
  db.run("DELETE FROM tasks WHERE planting_id = ?", [id]);
  db.run("DELETE FROM plantings WHERE id = ?", [id]);
}

export function updatePlantingStage(db: Database, id: string, stage: string, date?: string): Planting | null {
  const now = new Date().toISOString();
  const updates: string[] = ["stage = ?", "updated_at = ?"];
  const params: any[] = [stage, now];
  if (stage === "seeded_indoors" || stage === "direct_sown") {
    updates.push("started_at = COALESCE(started_at, ?)");
    params.push(date ?? now);
  }
  if (stage === "hardening_off") {
    updates.push("hardened_at = ?");
    params.push(date ?? now);
  }
  if (stage === "transplanted") {
    updates.push("transplanted_at = ?");
    params.push(date ?? now);
  }
  params.push(id);
  db.run(`UPDATE plantings SET ${updates.join(", ")} WHERE id = ?`, params);
  return getPlanting(db, id);
}

// --- Events ---

export interface GardenEvent {
  id: string;
  season_id: string;
  planting_id: string | null;
  space_id: string | null;
  type: string;
  happened_at: string;
  summary: string;
  data_json: string | null;
  created_at: string;
}

export interface CreateEventInput {
  seasonId: string;
  plantingId?: string;
  spaceId?: string;
  type: string;
  happenedAt?: string;
  summary: string;
  dataJson?: string;
}

export function createEvent(db: Database, input: CreateEventInput): GardenEvent {
  const id = genId("event");
  const now = new Date().toISOString();
  const happenedAt = input.happenedAt ?? now;
  db.run(
    `INSERT INTO events (id, season_id, planting_id, space_id, type, happened_at, summary, data_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.seasonId, input.plantingId ?? null, input.spaceId ?? null, input.type, happenedAt, input.summary, input.dataJson ?? null, now]
  );
  return {
    id, season_id: input.seasonId, planting_id: input.plantingId ?? null,
    space_id: input.spaceId ?? null, type: input.type,
    happened_at: happenedAt, summary: input.summary,
    data_json: input.dataJson ?? null, created_at: now,
  };
}

export function listEvents(db: Database, seasonId: string, filters?: { plantingId?: string; spaceId?: string; limit?: number }): GardenEvent[] {
  let sql = "SELECT * FROM events WHERE season_id = ?";
  const params: any[] = [seasonId];
  if (filters?.plantingId) { sql += " AND planting_id = ?"; params.push(filters.plantingId); }
  if (filters?.spaceId) { sql += " AND space_id = ?"; params.push(filters.spaceId); }
  sql += " ORDER BY happened_at DESC";
  if (filters?.limit) { sql += " LIMIT ?"; params.push(filters.limit); }
  return db.query(sql).all(...params) as GardenEvent[];
}

// --- Tasks ---

export interface Task {
  id: string;
  season_id: string;
  planting_id: string | null;
  space_id: string | null;
  title: string;
  type: string;
  status: string;
  priority: string;
  due_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface CreateTaskInput {
  seasonId: string;
  plantingId?: string;
  spaceId?: string;
  title: string;
  type?: string;
  priority?: string;
  dueAt?: string;
  notes?: string;
}

export function createTask(db: Database, input: CreateTaskInput): Task {
  const id = genId("task");
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO tasks (id, season_id, planting_id, space_id, title, type, status, priority, due_at, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.seasonId, input.plantingId ?? null, input.spaceId ?? null, input.title, input.type ?? "other", "open", input.priority ?? "medium", input.dueAt ?? null, input.notes ?? null, now, now]
  );
  return {
    id, season_id: input.seasonId, planting_id: input.plantingId ?? null,
    space_id: input.spaceId ?? null, title: input.title,
    type: input.type ?? "other", status: "open", priority: input.priority ?? "medium",
    due_at: input.dueAt ?? null, notes: input.notes ?? null,
    created_at: now, updated_at: now, completed_at: null,
  };
}

export function listTasks(db: Database, seasonId: string, filters?: { status?: string; spaceId?: string; dueBefore?: string }): Task[] {
  let sql = "SELECT * FROM tasks WHERE season_id = ?";
  const params: any[] = [seasonId];
  if (filters?.status) { sql += " AND status = ?"; params.push(filters.status); }
  if (filters?.spaceId) { sql += " AND space_id = ?"; params.push(filters.spaceId); }
  if (filters?.dueBefore) { sql += " AND due_at <= ?"; params.push(filters.dueBefore); }
  sql += " ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, due_at ASC";
  return db.query(sql).all(...params) as Task[];
}

export function getTask(db: Database, id: string): Task | null {
  return db.query("SELECT * FROM tasks WHERE id = ?").get(id) as Task | null;
}

export function findTask(db: Database, seasonId: string, idOrTitle: string): Task | null {
  const byId = getTask(db, idOrTitle);
  if (byId) return byId;
  // Partial title match
  return db.query("SELECT * FROM tasks WHERE season_id = ? AND title LIKE ? AND status = 'open' ORDER BY created_at DESC LIMIT 1").get(seasonId, `%${idOrTitle}%`) as Task | null;
}

export function deleteTask(db: Database, id: string): void {
  db.run("DELETE FROM tasks WHERE id = ?", [id]);
}

export function completeTask(db: Database, id: string): Task | null {
  const now = new Date().toISOString();
  db.run("UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?", [now, now, id]);
  return getTask(db, id);
}

// --- Grid Placements ---

export interface GridPlacement {
  id: string;
  space_id: string;
  planting_id: string;
  row: number;
  col: number;
  created_at: string;
}

export function placeOnGrid(db: Database, spaceId: string, plantingId: string, cells: { row: number; col: number }[]): GridPlacement[] {
  const results: GridPlacement[] = [];
  for (const cell of cells) {
    const id = genId("grid");
    db.run(
      "INSERT INTO grid_placements (id, space_id, planting_id, row, col) VALUES (?, ?, ?, ?, ?)",
      [id, spaceId, plantingId, cell.row, cell.col]
    );
    results.push({ id, space_id: spaceId, planting_id: plantingId, row: cell.row, col: cell.col, created_at: new Date().toISOString() });
  }
  return results;
}

export function removeGridPlacements(db: Database, plantingId: string): number {
  const existing = db.query("SELECT COUNT(*) as c FROM grid_placements WHERE planting_id = ?").get(plantingId) as { c: number };
  db.run("DELETE FROM grid_placements WHERE planting_id = ?", [plantingId]);
  return existing.c;
}

export function getGridForSpace(db: Database, spaceId: string): (GridPlacement & { crop: string; variety: string | null; stage: string; health: string })[] {
  return db.query(
    `SELECT gp.*, p.crop, p.variety, p.stage, p.health
     FROM grid_placements gp
     JOIN plantings p ON gp.planting_id = p.id
     WHERE gp.space_id = ?
     ORDER BY gp.row, gp.col`
  ).all(spaceId) as any[];
}

export function updatePlantingSpace(db: Database, id: string, spaceId: string): void {
  db.run("UPDATE plantings SET space_id = ?, updated_at = ? WHERE id = ?", [spaceId, new Date().toISOString(), id]);
}

export function deleteSpace(db: Database, id: string): void {
  db.run("DELETE FROM spaces WHERE id = ?", [id]);
}

// --- Planting Schedule Queries ---

export function plantingsNeedingStart(db: Database, seasonId: string, beforeDate: string): Planting[] {
  return db.query(
    `SELECT * FROM plantings WHERE season_id = ? AND stage = 'planned' AND target_start_date IS NOT NULL AND target_start_date <= ?
     ORDER BY target_start_date ASC`
  ).all(seasonId, beforeDate) as Planting[];
}

export function plantingsNeedingHarden(db: Database, seasonId: string, beforeDate: string): Planting[] {
  return db.query(
    `SELECT * FROM plantings WHERE season_id = ? AND stage IN ('seeded_indoors','seedling') AND target_harden_date IS NOT NULL AND target_harden_date <= ?
     ORDER BY target_harden_date ASC`
  ).all(seasonId, beforeDate) as Planting[];
}

export function plantingsNeedingTransplant(db: Database, seasonId: string, beforeDate: string): Planting[] {
  return db.query(
    `SELECT * FROM plantings WHERE season_id = ? AND stage IN ('seeded_indoors','seedling','hardening_off') AND target_transplant_date IS NOT NULL AND target_transplant_date <= ?
     ORDER BY target_transplant_date ASC`
  ).all(seasonId, beforeDate) as Planting[];
}

export function listScheduledPlantings(db: Database, seasonId: string): Planting[] {
  return db.query(
    `SELECT * FROM plantings WHERE season_id = ? AND (target_start_date IS NOT NULL OR target_harden_date IS NOT NULL OR target_transplant_date IS NOT NULL)
     ORDER BY target_start_date ASC, crop ASC`
  ).all(seasonId) as Planting[];
}
