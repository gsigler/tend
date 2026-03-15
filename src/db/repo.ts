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
  stage: string;
  health: string;
  quantity: number | null;
  quantity_unit: string | null;
  started_at: string | null;
  transplanted_at: string | null;
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
  stage?: string;
  quantity?: number;
  quantityUnit?: string;
  startedAt?: string;
  notes?: string;
}

export function createPlanting(db: Database, input: CreatePlantingInput): Planting {
  const id = genId("planting");
  const now = new Date().toISOString();
  const stage = input.stage ?? "planned";
  const transplantedAt = stage === "transplanted" ? (input.startedAt ?? now) : null;
  db.run(
    `INSERT INTO plantings (id, season_id, space_id, crop, variety, source_type, stage, health, quantity, quantity_unit, started_at, transplanted_at, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.seasonId, input.spaceId ?? null, input.crop, input.variety ?? null, input.sourceType ?? "seed", stage, "healthy", input.quantity ?? null, input.quantityUnit ?? null, input.startedAt ?? null, transplantedAt, input.notes ?? null, now, now]
  );
  return {
    id, season_id: input.seasonId, space_id: input.spaceId ?? null,
    crop: input.crop, variety: input.variety ?? null,
    source_type: input.sourceType ?? "seed", stage, health: "healthy",
    quantity: input.quantity ?? null, quantity_unit: input.quantityUnit ?? null,
    started_at: input.startedAt ?? null, transplanted_at: transplantedAt,
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

export function updatePlantingStage(db: Database, id: string, stage: string, date?: string): Planting | null {
  const now = new Date().toISOString();
  const updates: string[] = ["stage = ?", "updated_at = ?"];
  const params: any[] = [stage, now];
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

export function completeTask(db: Database, id: string): Task | null {
  const now = new Date().toISOString();
  db.run("UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?", [now, now, id]);
  return getTask(db, id);
}

// --- Seed Plans ---

export interface SeedPlan {
  id: string;
  season_id: string;
  crop: string;
  variety: string | null;
  source: string | null;
  start_type: string;
  qty_to_start: number | null;
  grid_squares: number | null;
  space_id: string | null;
  target_start_date: string | null;
  target_harden_date: string | null;
  target_transplant_date: string | null;
  started_at: string | null;
  hardened_at: string | null;
  transplanted_at: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSeedPlanInput {
  seasonId: string;
  crop: string;
  variety?: string;
  source?: string;
  startType?: string;
  qtyToStart?: number;
  gridSquares?: number;
  spaceId?: string;
  targetStartDate?: string;
  targetHardenDate?: string;
  targetTransplantDate?: string;
  notes?: string;
}

export function createSeedPlan(db: Database, input: CreateSeedPlanInput): SeedPlan {
  const id = genId("plan");
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO seed_plans (id, season_id, crop, variety, source, start_type, qty_to_start, grid_squares, space_id,
      target_start_date, target_harden_date, target_transplant_date, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.seasonId, input.crop, input.variety ?? null, input.source ?? null,
     input.startType ?? "indoor", input.qtyToStart ?? null, input.gridSquares ?? null, input.spaceId ?? null,
     input.targetStartDate ?? null, input.targetHardenDate ?? null, input.targetTransplantDate ?? null,
     input.notes ?? null, now, now]
  );
  return {
    id, season_id: input.seasonId, crop: input.crop, variety: input.variety ?? null,
    source: input.source ?? null, start_type: input.startType ?? "indoor",
    qty_to_start: input.qtyToStart ?? null, grid_squares: input.gridSquares ?? null,
    space_id: input.spaceId ?? null,
    target_start_date: input.targetStartDate ?? null,
    target_harden_date: input.targetHardenDate ?? null,
    target_transplant_date: input.targetTransplantDate ?? null,
    started_at: null, hardened_at: null, transplanted_at: null,
    status: "planned", notes: input.notes ?? null,
    created_at: now, updated_at: now,
  };
}

export function getSeedPlan(db: Database, id: string): SeedPlan | null {
  return db.query("SELECT * FROM seed_plans WHERE id = ?").get(id) as SeedPlan | null;
}

export function findSeedPlan(db: Database, seasonId: string, idOrCrop: string): SeedPlan | null {
  const byId = getSeedPlan(db, idOrCrop);
  if (byId) return byId;
  return db.query("SELECT * FROM seed_plans WHERE season_id = ? AND crop = ? ORDER BY created_at DESC LIMIT 1").get(seasonId, idOrCrop) as SeedPlan | null;
}

export function deleteSpace(db: Database, id: string): void {
  db.run("DELETE FROM spaces WHERE id = ?", [id]);
}

export function listSeedPlans(db: Database, seasonId: string, filters?: { status?: string; startType?: string }): SeedPlan[] {
  let sql = "SELECT * FROM seed_plans WHERE season_id = ?";
  const params: any[] = [seasonId];
  if (filters?.status) { sql += " AND status = ?"; params.push(filters.status); }
  if (filters?.startType) { sql += " AND start_type = ?"; params.push(filters.startType); }
  sql += " ORDER BY target_start_date ASC, crop ASC";
  return db.query(sql).all(...params) as SeedPlan[];
}

export function updateSeedPlanStatus(db: Database, id: string, status: string, dateField?: { field: string; value: string }): SeedPlan | null {
  const now = new Date().toISOString();
  let sql = "UPDATE seed_plans SET status = ?, updated_at = ?";
  const params: any[] = [status, now];
  if (dateField) {
    sql += `, ${dateField.field} = ?`;
    params.push(dateField.value);
  }
  sql += " WHERE id = ?";
  params.push(id);
  db.run(sql, params);
  return getSeedPlan(db, id);
}

export function seedPlansNeedingAction(db: Database, seasonId: string, beforeDate: string): SeedPlan[] {
  return db.query(
    `SELECT * FROM seed_plans WHERE season_id = ? AND status = 'planned' AND target_start_date IS NOT NULL AND target_start_date <= ?
     ORDER BY target_start_date ASC`
  ).all(seasonId, beforeDate) as SeedPlan[];
}

export function seedPlansNeedingHarden(db: Database, seasonId: string, beforeDate: string): SeedPlan[] {
  return db.query(
    `SELECT * FROM seed_plans WHERE season_id = ? AND status = 'started' AND target_harden_date IS NOT NULL AND target_harden_date <= ?
     ORDER BY target_harden_date ASC`
  ).all(seasonId, beforeDate) as SeedPlan[];
}

export function seedPlansNeedingTransplant(db: Database, seasonId: string, beforeDate: string): SeedPlan[] {
  return db.query(
    `SELECT * FROM seed_plans WHERE season_id = ? AND status IN ('started','hardening') AND target_transplant_date IS NOT NULL AND target_transplant_date <= ?
     ORDER BY target_transplant_date ASC`
  ).all(seasonId, beforeDate) as SeedPlan[];
}
