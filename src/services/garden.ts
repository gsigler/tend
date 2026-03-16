import { Database } from "bun:sqlite";
import { getDb, readConfig } from "../db/connection";
import * as repo from "../db/repo";
import { TendError } from "./errors";

function resolveSpaceId(db: Database, seasonId: string, spaceName?: string): string | undefined {
  if (!spaceName) return undefined;
  const space = repo.getSpaceByName(db, seasonId, spaceName);
  if (!space) throw new TendError("NOT_FOUND", `Space '${spaceName}' not found`);
  return space.id;
}

// --- Spaces ---

export function addSpace(input: repo.CreateSpaceInput) {
  const db = getDb();
  const existing = repo.getSpaceByName(db, input.seasonId, input.name);
  if (existing) throw new TendError("CONFLICT", `Space '${input.name}' already exists`);
  return repo.createSpace(db, input);
}

export function removeSpace(seasonId: string, name: string) {
  const db = getDb();
  const space = repo.getSpaceByName(db, seasonId, name);
  if (!space) throw new TendError("NOT_FOUND", `Space '${name}' not found`);
  repo.deleteSpace(db, space.id);
  return space;
}

export function listSpaces(seasonId: string) {
  const db = getDb();
  return repo.listSpaces(db, seasonId);
}

// --- Plantings ---

export function addPlanting(input: repo.CreatePlantingInput) {
  const db = getDb();
  const config = readConfig();
  const planting = repo.createPlanting(db, input);
  repo.createEvent(db, {
    seasonId: input.seasonId,
    plantingId: planting.id,
    spaceId: input.spaceId,
    type: "created",
    happenedAt: input.startedAt,
    summary: `Planted ${input.crop}${input.variety ? ` (${input.variety})` : ""}`,
  });
  return planting;
}

export function listPlantings(seasonId: string, filters?: { spaceId?: string; stage?: string; crop?: string }) {
  const db = getDb();
  return repo.listPlantings(db, seasonId, filters);
}

export function updatePlantingStage(plantingIdOrCrop: string, stage: string, date?: string) {
  const db = getDb();
  const config = readConfig();
  const existing = repo.findPlanting(db, config.defaultSeasonId, plantingIdOrCrop);
  if (!existing) throw new TendError("NOT_FOUND", `Planting '${plantingIdOrCrop}' not found`);
  const plantingId = existing.id;
  const planting = repo.updatePlantingStage(db, plantingId, stage, date);
  repo.createEvent(db, {
    seasonId: existing.season_id,
    plantingId: plantingId,
    spaceId: existing.space_id ?? undefined,
    type: "stage_changed",
    happenedAt: date,
    summary: `${existing.crop} stage changed to ${stage}`,
  });
  return planting;
}

export function findPlantingStrict(seasonId: string, idOrCrop: string) {
  const db = getDb();
  // Try by ID first
  const byId = repo.getPlanting(db, idOrCrop);
  if (byId) return byId;
  // Try "crop (variety)" format
  const parenMatch = idOrCrop.match(/^(.+?)\s*\((.+)\)$/);
  if (parenMatch) {
    const [, crop, variety] = parenMatch;
    const all = repo.findPlantingsByCrop(db, seasonId, crop.trim());
    const exact = all.filter(p => p.variety?.toLowerCase() === variety.trim().toLowerCase());
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) {
      // Still ambiguous even with variety — shouldn't happen but handle it
      const lines = exact.map(p => {
        const spaceName = p.space_id ? (() => { const sp = repo.getSpace(db, p.space_id); return sp ? sp.name : p.space_id; })() : "";
        const where = spaceName ? ` → ${spaceName}` : "";
        return `  ${p.id}  ${p.crop} (${p.variety})${where}`;
      });
      throw new TendError("CONFLICT", `Multiple plantings match '${idOrCrop}'. Use an ID:\n${lines.join("\n")}`);
    }
    // No exact variety match — fall through to crop-only search
  }
  // Then by crop name — check for ambiguity
  const matches = repo.findPlantingsByCrop(db, seasonId, idOrCrop);
  if (matches.length === 0) throw new TendError("NOT_FOUND", `Planting '${idOrCrop}' not found`);
  if (matches.length === 1) return matches[0];
  // Ambiguous
  const lines = matches.map(p => {
    const spaceName = p.space_id ? (() => { const sp = repo.getSpace(db, p.space_id); return sp ? sp.name : p.space_id; })() : "";
    const where = spaceName ? ` → ${spaceName}` : "";
    const v = p.variety ? ` (${p.variety})` : "";
    return `  ${p.id}  ${p.crop}${v}${where}`;
  });
  throw new TendError("CONFLICT", `Multiple plantings match '${idOrCrop}'. Use an ID:\n${lines.join("\n")}`);
}

export function updatePlanting(plantingIdOrCrop: string, input: repo.UpdatePlantingInput) {
  const db = getDb();
  const config = readConfig();
  const existing = findPlantingStrict(config.defaultSeasonId, plantingIdOrCrop);

  // If changing space, clear grid placements
  if (input.spaceId !== undefined && input.spaceId !== existing.space_id) {
    const cleared = repo.removeGridPlacements(db, existing.id);
    if (cleared > 0) {
      console.log("Note: grid placements cleared — use 'tend plantings place' to reassign.");
    }
  }

  const updated = repo.updatePlanting(db, existing.id, input);
  return updated;
}

export function removePlanting(idOrCrop: string) {
  const db = getDb();
  const config = readConfig();
  const existing = repo.findPlanting(db, config.defaultSeasonId, idOrCrop);
  if (!existing) throw new TendError("NOT_FOUND", `Planting '${idOrCrop}' not found`);
  repo.deletePlanting(db, existing.id);
  return existing;
}

// --- Tasks ---

export function addTask(input: repo.CreateTaskInput) {
  const db = getDb();
  return repo.createTask(db, input);
}

export function listTasks(seasonId: string, filters?: { status?: string; spaceId?: string; dueBefore?: string }) {
  const db = getDb();
  return repo.listTasks(db, seasonId, filters);
}

export function completeTask(taskIdOrTitle: string) {
  const db = getDb();
  const config = readConfig();
  const existing = repo.findTask(db, config.defaultSeasonId, taskIdOrTitle);
  if (!existing) throw new TendError("NOT_FOUND", `Task '${taskIdOrTitle}' not found`);
  const taskId = existing.id;
  const task = repo.completeTask(db, taskId);
  repo.createEvent(db, {
    seasonId: existing.season_id,
    type: "task_completed",
    spaceId: existing.space_id ?? undefined,
    plantingId: existing.planting_id ?? undefined,
    summary: `Completed: ${existing.title}`,
  });
  return task;
}

export function removeTask(taskIdOrTitle: string) {
  const db = getDb();
  const config = readConfig();
  const existing = repo.findTask(db, config.defaultSeasonId, taskIdOrTitle);
  if (!existing) throw new TendError("NOT_FOUND", `Task '${taskIdOrTitle}' not found`);
  repo.deleteTask(db, existing.id);
  return existing;
}

// --- Events ---

export function listEvents(seasonId: string, filters?: { plantingId?: string; spaceId?: string; limit?: number }) {
  const db = getDb();
  return repo.listEvents(db, seasonId, filters);
}

export function logEvent(input: repo.CreateEventInput) {
  const db = getDb();
  return repo.createEvent(db, input);
}

// --- Grid Placement ---

export function placePlanting(seasonId: string, plantingIdOrCrop: string, spaceName: string, cells: { row: number; col: number }[]) {
  const db = getDb();
  const config = readConfig();
  const planting = repo.findPlanting(db, seasonId, plantingIdOrCrop);
  if (!planting) throw new TendError("NOT_FOUND", `Planting '${plantingIdOrCrop}' not found`);
  const space = repo.getSpaceByName(db, seasonId, spaceName);
  if (!space) throw new TendError("NOT_FOUND", `Space '${spaceName}' not found`);

  // Set space_id on planting if not already set
  if (!planting.space_id || planting.space_id !== space.id) {
    repo.updatePlantingSpace(db, planting.id, space.id);
  }

  const placements = repo.placeOnGrid(db, space.id, planting.id, cells);
  return { planting, space, placements };
}

export function unplacePlanting(seasonId: string, plantingIdOrCrop: string) {
  const db = getDb();
  const planting = repo.findPlanting(db, seasonId, plantingIdOrCrop);
  if (!planting) throw new TendError("NOT_FOUND", `Planting '${plantingIdOrCrop}' not found`);
  const count = repo.removeGridPlacements(db, planting.id);
  return { planting, removedCount: count };
}

export function getSpaceMap(seasonId: string, spaceName: string) {
  const db = getDb();
  const space = repo.getSpaceByName(db, seasonId, spaceName);
  if (!space) throw new TendError("NOT_FOUND", `Space '${spaceName}' not found`);
  const placements = repo.getGridForSpace(db, space.id);
  return { space, placements };
}

// --- Summary ---

export function getSummary(seasonId: string) {
  const db = getDb();
  const config = readConfig();
  const garden = repo.getGarden(db, config.defaultGardenId);
  const season = repo.getSeason(db, seasonId);
  const spaces = repo.listSpaces(db, seasonId);
  const plantings = repo.listPlantings(db, seasonId);
  const openTasks = repo.listTasks(db, seasonId, { status: "open" });
  return { garden, season, spaces, plantings, openTasks };
}

// --- Week ---

export function getWeekPlan(seasonId: string) {
  const db = getDb();
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const allOpenTasks = repo.listTasks(db, seasonId, { status: "open" });
  const overdue = allOpenTasks.filter(t => t.due_at && t.due_at < today);
  const thisWeek = allOpenTasks.filter(t => t.due_at && t.due_at >= today && t.due_at <= nextWeek);
  const noDue = allOpenTasks.filter(t => !t.due_at);

  // Suggested checks: seedlings not checked in 7 days, hardening plants, producing without recent events
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const plantings = repo.listPlantings(db, seasonId);
  const events = repo.listEvents(db, seasonId);

  const suggestions: string[] = [];

  for (const p of plantings) {
    const name = p.variety ? `${p.crop} (${p.variety})` : p.crop;
    const recentEvents = events.filter(e => e.planting_id === p.id && e.happened_at >= sevenDaysAgo);
    if (p.stage === "seedling" && recentEvents.length === 0) {
      suggestions.push(`Check seedling: ${name} — not checked in 7+ days`);
    }
    if (p.stage === "hardening_off" && recentEvents.length === 0) {
      suggestions.push(`Check hardening: ${name} — no recent activity`);
    }
    if (p.stage === "producing" && recentEvents.length === 0) {
      suggestions.push(`Check producing: ${name} — no recent harvest or observation`);
    }
  }

  // Schedule actions from plantings with target dates
  const startsDue = repo.plantingsNeedingStart(db, seasonId, nextWeek);
  const hardenDue = repo.plantingsNeedingHarden(db, seasonId, nextWeek);
  const transplantDue = repo.plantingsNeedingTransplant(db, seasonId, nextWeek);

  const scheduleActions: { action: string; planting: repo.Planting; targetDate: string }[] = [];
  for (const p of startsDue) {
    const isOverdue = p.target_start_date! < today;
    scheduleActions.push({ action: isOverdue ? "OVERDUE: Start seeds" : "Start seeds", planting: p, targetDate: p.target_start_date! });
  }
  for (const p of hardenDue) {
    const isOverdue = p.target_harden_date! < today;
    scheduleActions.push({ action: isOverdue ? "OVERDUE: Begin hardening" : "Begin hardening", planting: p, targetDate: p.target_harden_date! });
  }
  for (const p of transplantDue) {
    const isOverdue = p.target_transplant_date! < today;
    scheduleActions.push({ action: isOverdue ? "OVERDUE: Transplant" : "Transplant", planting: p, targetDate: p.target_transplant_date! });
  }
  scheduleActions.sort((a, b) => a.targetDate.localeCompare(b.targetDate));

  return { overdue, thisWeek, noDue, suggestions, scheduleActions };
}

// --- Schedule ---

export function getPlantingSchedule(seasonId: string) {
  const db = getDb();
  const plantings = repo.listScheduledPlantings(db, seasonId);
  const today = new Date().toISOString().split("T")[0];

  const upcoming: (repo.Planting & { next_action: string; next_date: string })[] = [];
  const overdueList: (repo.Planting & { next_action: string; next_date: string })[] = [];
  const done: repo.Planting[] = [];

  const finishedStages = ["finished", "failed", "producing", "transplanted", "direct_sown"];

  for (const p of plantings) {
    if (finishedStages.includes(p.stage)) {
      done.push(p);
      continue;
    }

    let nextAction: string | null = null;
    let nextDate: string | null = null;

    if (p.stage === "planned" && p.target_start_date) {
      nextAction = p.source_type === "seed" ? "Start indoors" : "Direct sow";
      nextDate = p.target_start_date;
    } else if ((p.stage === "seeded_indoors" || p.stage === "seedling") && p.target_harden_date) {
      nextAction = "Begin hardening off";
      nextDate = p.target_harden_date;
    } else if ((p.stage === "seeded_indoors" || p.stage === "seedling" || p.stage === "hardening_off") && p.target_transplant_date) {
      nextAction = "Transplant";
      nextDate = p.target_transplant_date;
    }

    if (nextAction && nextDate) {
      const entry = { ...p, next_action: nextAction, next_date: nextDate };
      if (nextDate < today) {
        overdueList.push(entry);
      } else {
        upcoming.push(entry);
      }
    } else {
      upcoming.push({ ...p, next_action: "No target date set", next_date: "" });
    }
  }

  overdueList.sort((a, b) => a.next_date.localeCompare(b.next_date));
  upcoming.sort((a, b) => (a.next_date || "9999").localeCompare(b.next_date || "9999"));

  return { overdue: overdueList, upcoming, done };
}

export function generateTasksFromSchedule(seasonId: string) {
  const db = getDb();
  const plantings = repo.listScheduledPlantings(db, seasonId);
  const existingTasks = repo.listTasks(db, seasonId);
  const created: repo.Task[] = [];

  for (const p of plantings) {
    const hasTask = (keyword: string) =>
      existingTasks.some(t => t.notes?.includes(p.id) && t.title.includes(keyword) && t.status === "open");

    if (p.stage === "planned" && p.target_start_date) {
      const action = p.source_type === "seed" ? "Start indoors" : "Direct sow";
      const title = `${action}: ${p.crop}${p.variety ? ` (${p.variety})` : ""}`;
      if (!hasTask(p.crop)) {
        const task = repo.createTask(db, {
          seasonId, spaceId: p.space_id ?? undefined,
          title, type: "seed_start", priority: "high",
          dueAt: p.target_start_date,
          notes: `Auto-generated from planting ${p.id}. Qty: ${p.quantity ?? "?"}`,
        });
        created.push(task);
      }
    }

    if ((p.stage === "seeded_indoors" || p.stage === "seedling") && p.target_harden_date) {
      const title = `Begin hardening: ${p.crop}${p.variety ? ` (${p.variety})` : ""}`;
      if (!hasTask(p.crop)) {
        const task = repo.createTask(db, {
          seasonId, spaceId: p.space_id ?? undefined,
          title, type: "maintenance", priority: "medium",
          dueAt: p.target_harden_date,
          notes: `Auto-generated from planting ${p.id}`,
        });
        created.push(task);
      }
    }

    if ((p.stage === "seeded_indoors" || p.stage === "seedling" || p.stage === "hardening_off") && p.target_transplant_date) {
      const title = `Transplant: ${p.crop}${p.variety ? ` (${p.variety})` : ""}`;
      if (!hasTask(p.crop)) {
        const task = repo.createTask(db, {
          seasonId, spaceId: p.space_id ?? undefined,
          title, type: "transplant", priority: "high",
          dueAt: p.target_transplant_date,
          notes: `Auto-generated from planting ${p.id}. Grid squares: ${p.grid_squares ?? "?"}`,
        });
        created.push(task);
      }
    }
  }

  return created;
}
