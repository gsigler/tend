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

// --- Events ---

export function listEvents(seasonId: string, filters?: { plantingId?: string; spaceId?: string; limit?: number }) {
  const db = getDb();
  return repo.listEvents(db, seasonId, filters);
}

export function logEvent(input: repo.CreateEventInput) {
  const db = getDb();
  return repo.createEvent(db, input);
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
  const seedPlans = repo.listSeedPlans(db, seasonId);
  return { garden, season, spaces, plantings, openTasks, seedPlans };
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
    const recentEvents = events.filter(e => e.planting_id === p.id && e.happened_at >= sevenDaysAgo);
    if (p.stage === "seedling" && recentEvents.length === 0) {
      suggestions.push(`Seedling "${p.crop}" has not been checked in 7+ days`);
    }
    if (p.stage === "hardening_off" && recentEvents.length === 0) {
      suggestions.push(`Hardening plant "${p.crop}" has no recent activity`);
    }
    if (p.stage === "producing" && recentEvents.length === 0) {
      suggestions.push(`Producing plant "${p.crop}" has no recent harvest or observation`);
    }
  }

  // Seed plan actions due this week
  const planStartsDue = repo.seedPlansNeedingAction(db, seasonId, nextWeek);
  const planHardenDue = repo.seedPlansNeedingHarden(db, seasonId, nextWeek);
  const planTransplantDue = repo.seedPlansNeedingTransplant(db, seasonId, nextWeek);

  const planActions: { action: string; plan: repo.SeedPlan; targetDate: string }[] = [];
  for (const p of planStartsDue) {
    const overdue = p.target_start_date! < today;
    planActions.push({ action: overdue ? "OVERDUE: Start seeds" : "Start seeds", plan: p, targetDate: p.target_start_date! });
  }
  for (const p of planHardenDue) {
    const overdue = p.target_harden_date! < today;
    planActions.push({ action: overdue ? "OVERDUE: Begin hardening" : "Begin hardening", plan: p, targetDate: p.target_harden_date! });
  }
  for (const p of planTransplantDue) {
    const overdue = p.target_transplant_date! < today;
    planActions.push({ action: overdue ? "OVERDUE: Transplant" : "Transplant", plan: p, targetDate: p.target_transplant_date! });
  }
  planActions.sort((a, b) => a.targetDate.localeCompare(b.targetDate));

  return { overdue, thisWeek, noDue, suggestions, planActions };
}

// --- Seed Plans ---

export function addSeedPlan(input: repo.CreateSeedPlanInput) {
  const db = getDb();
  return repo.createSeedPlan(db, input);
}

export function listSeedPlans(seasonId: string, filters?: { status?: string; startType?: string }) {
  const db = getDb();
  return repo.listSeedPlans(db, seasonId, filters);
}

export function updateSeedPlanStatus(planIdOrCrop: string, status: string, date?: string) {
  const db = getDb();
  const config = readConfig();
  const existing = repo.findSeedPlan(db, config.defaultSeasonId, planIdOrCrop);
  if (!existing) throw new TendError("NOT_FOUND", `Seed plan '${planIdOrCrop}' not found`);
  const planId = existing.id;

  const dateFieldMap: Record<string, string> = {
    started: "started_at",
    hardening: "hardened_at",
    transplanted: "transplanted_at",
    direct_sown: "started_at",
  };

  const dateField = dateFieldMap[status];
  const plan = repo.updateSeedPlanStatus(db, planId, status,
    dateField ? { field: dateField, value: date ?? new Date().toISOString().split("T")[0] } : undefined
  );

  repo.createEvent(db, {
    seasonId: existing.season_id,
    spaceId: existing.space_id ?? undefined,
    type: "stage_changed",
    summary: `Seed plan: ${existing.crop}${existing.variety ? ` (${existing.variety})` : ""} → ${status}`,
  });

  return plan;
}

export function getSeedSchedule(seasonId: string) {
  const db = getDb();
  const plans = repo.listSeedPlans(db, seasonId);
  const today = new Date().toISOString().split("T")[0];

  const upcoming: (repo.SeedPlan & { next_action: string; next_date: string })[] = [];
  const overdue: (repo.SeedPlan & { next_action: string; next_date: string })[] = [];
  const done: repo.SeedPlan[] = [];

  for (const p of plans) {
    if (p.status === "done" || p.status === "skipped" || p.status === "transplanted" || p.status === "direct_sown") {
      done.push(p);
      continue;
    }

    let nextAction: string | null = null;
    let nextDate: string | null = null;

    if (p.status === "planned" && p.target_start_date) {
      nextAction = p.start_type === "indoor" ? "Start indoors" : "Direct sow";
      nextDate = p.target_start_date;
    } else if (p.status === "started" && p.target_harden_date) {
      nextAction = "Begin hardening off";
      nextDate = p.target_harden_date;
    } else if ((p.status === "started" || p.status === "hardening") && p.target_transplant_date) {
      nextAction = "Transplant";
      nextDate = p.target_transplant_date;
    }

    if (nextAction && nextDate) {
      const entry = { ...p, next_action: nextAction, next_date: nextDate };
      if (nextDate < today) {
        overdue.push(entry);
      } else {
        upcoming.push(entry);
      }
    } else {
      upcoming.push({ ...p, next_action: "No target date set", next_date: "" });
    }
  }

  overdue.sort((a, b) => a.next_date.localeCompare(b.next_date));
  upcoming.sort((a, b) => (a.next_date || "9999").localeCompare(b.next_date || "9999"));

  return { overdue, upcoming, done };
}

export function generateTasksFromPlans(seasonId: string) {
  const db = getDb();
  const plans = repo.listSeedPlans(db, seasonId);
  const existingTasks = repo.listTasks(db, seasonId);
  const created: repo.Task[] = [];

  for (const p of plans) {
    // Check if task already exists for this plan action
    const hasPlanTask = (keyword: string, dueAt: string | null) =>
      existingTasks.some(t => t.notes?.includes(p.id) && t.title.includes(keyword) && t.status === "open");

    if (p.status === "planned" && p.target_start_date) {
      const action = p.start_type === "indoor" ? "Start indoors" : "Direct sow";
      const title = `${action}: ${p.crop}${p.variety ? ` (${p.variety})` : ""}`;
      if (!hasPlanTask(p.crop, p.target_start_date)) {
        const task = repo.createTask(db, {
          seasonId, spaceId: p.space_id ?? undefined,
          title, type: "seed_start", priority: "high",
          dueAt: p.target_start_date,
          notes: `Auto-generated from seed plan ${p.id}. Qty: ${p.qty_to_start ?? "?"}`,
        });
        created.push(task);
      }
    }

    if (p.status === "started" && p.target_harden_date) {
      const title = `Begin hardening: ${p.crop}${p.variety ? ` (${p.variety})` : ""}`;
      if (!hasPlanTask(p.crop, p.target_harden_date)) {
        const task = repo.createTask(db, {
          seasonId, spaceId: p.space_id ?? undefined,
          title, type: "maintenance", priority: "medium",
          dueAt: p.target_harden_date,
          notes: `Auto-generated from seed plan ${p.id}`,
        });
        created.push(task);
      }
    }

    if ((p.status === "started" || p.status === "hardening") && p.target_transplant_date) {
      const title = `Transplant: ${p.crop}${p.variety ? ` (${p.variety})` : ""}`;
      if (!hasPlanTask(p.crop, p.target_transplant_date)) {
        const task = repo.createTask(db, {
          seasonId, spaceId: p.space_id ?? undefined,
          title, type: "transplant", priority: "high",
          dueAt: p.target_transplant_date,
          notes: `Auto-generated from seed plan ${p.id}. Grid squares: ${p.grid_squares ?? "?"}`,
        });
        created.push(task);
      }
    }
  }

  return created;
}
