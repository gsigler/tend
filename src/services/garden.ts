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
  return repo.createSpace(db, input);
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

export function updatePlantingStage(plantingId: string, stage: string, date?: string) {
  const db = getDb();
  const existing = repo.getPlanting(db, plantingId);
  if (!existing) throw new TendError("NOT_FOUND", `Planting '${plantingId}' not found`);
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

export function completeTask(taskId: string) {
  const db = getDb();
  const existing = repo.getTask(db, taskId);
  if (!existing) throw new TendError("NOT_FOUND", `Task '${taskId}' not found`);
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

  return { overdue, thisWeek, noDue, suggestions };
}
