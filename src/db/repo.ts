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

export function completeTask(db: Database, id: string): Task | null {
  const now = new Date().toISOString();
  db.run("UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?", [now, now, id]);
  return getTask(db, id);
}
