import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { initializeSchema } from "../src/db/schema";
import * as repo from "../src/db/repo";

// We test the service logic by calling repo functions directly with event creation
// (since services depend on config/getDb which need file system setup)

describe("service logic: planting lifecycle", () => {
  let db: Database;
  let seasonId: string;
  let spaceId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys=ON");
    initializeSchema(db);
    const g = repo.createGarden(db, "G");
    const s = repo.createSeason(db, { gardenId: g.id, year: 2026, name: "S" });
    seasonId = s.id;
    const sp = repo.createSpace(db, { seasonId: s.id, name: "bed-1", type: "raised_bed" });
    spaceId = sp.id;
  });

  test("full planting lifecycle with events", () => {
    // Create planting
    const p = repo.createPlanting(db, { seasonId, spaceId, crop: "tomato", sourceType: "seed", stage: "seeded_indoors" });
    repo.createEvent(db, { seasonId, plantingId: p.id, type: "created", summary: "Planted tomato" });

    // Move to seedling
    repo.updatePlantingStage(db, p.id, "seedling");
    repo.createEvent(db, { seasonId, plantingId: p.id, type: "stage_changed", summary: "tomato → seedling" });

    // Hardening off
    repo.updatePlantingStage(db, p.id, "hardening_off");
    repo.createEvent(db, { seasonId, plantingId: p.id, type: "stage_changed", summary: "tomato → hardening_off" });

    // Transplant
    const transplanted = repo.updatePlantingStage(db, p.id, "transplanted", "2026-05-15");
    repo.createEvent(db, { seasonId, plantingId: p.id, type: "stage_changed", summary: "tomato → transplanted" });
    expect(transplanted!.transplanted_at).toBe("2026-05-15");

    // Producing
    repo.updatePlantingStage(db, p.id, "producing");
    repo.createEvent(db, { seasonId, plantingId: p.id, type: "stage_changed", summary: "tomato → producing" });

    // Harvest event
    repo.createEvent(db, { seasonId, plantingId: p.id, type: "harvested", summary: "Picked 5 tomatoes", dataJson: JSON.stringify({ quantity: 5, unit: "fruits" }) });

    // Finished
    repo.updatePlantingStage(db, p.id, "finished");
    repo.createEvent(db, { seasonId, plantingId: p.id, type: "stage_changed", summary: "tomato → finished" });

    const final = repo.getPlanting(db, p.id);
    expect(final!.stage).toBe("finished");

    const events = repo.listEvents(db, seasonId, { plantingId: p.id });
    expect(events).toHaveLength(7);
  });

  test("task creation and completion with events", () => {
    const task = repo.createTask(db, { seasonId, spaceId, title: "Thin carrots", type: "maintenance", priority: "medium", dueAt: "2026-04-01" });
    expect(task.status).toBe("open");

    const done = repo.completeTask(db, task.id);
    repo.createEvent(db, { seasonId, spaceId, type: "task_completed", summary: `Completed: ${task.title}` });

    expect(done!.status).toBe("done");
    expect(done!.completed_at).not.toBeNull();

    const events = repo.listEvents(db, seasonId, { spaceId });
    expect(events.some(e => e.type === "task_completed")).toBe(true);
  });

  test("observations and journal entries", () => {
    repo.createEvent(db, { seasonId, spaceId, type: "observed", summary: "peas yellowing", happenedAt: "2026-03-20" });
    repo.createEvent(db, { seasonId, spaceId, type: "note", summary: "applied compost", happenedAt: "2026-03-21" });
    repo.createEvent(db, { seasonId, type: "harvested", summary: "picked lettuce", dataJson: JSON.stringify({ quantity: 2, unit: "heads" }), happenedAt: "2026-03-22" });

    const events = repo.listEvents(db, seasonId);
    expect(events).toHaveLength(3);

    const spaceEvents = repo.listEvents(db, seasonId, { spaceId });
    expect(spaceEvents).toHaveLength(2);
  });
});

describe("service logic: week plan", () => {
  let db: Database;
  let seasonId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys=ON");
    initializeSchema(db);
    const g = repo.createGarden(db, "G");
    const s = repo.createSeason(db, { gardenId: g.id, year: 2026, name: "S" });
    seasonId = s.id;
  });

  test("tasks partition into overdue, this week, no due date", () => {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86400000).toISOString().split("T")[0];
    const tomorrow = new Date(today.getTime() + 86400000).toISOString().split("T")[0];
    const nextMonth = new Date(today.getTime() + 30 * 86400000).toISOString().split("T")[0];

    repo.createTask(db, { seasonId, title: "Overdue", dueAt: yesterday });
    repo.createTask(db, { seasonId, title: "This week", dueAt: tomorrow });
    repo.createTask(db, { seasonId, title: "Next month", dueAt: nextMonth });
    repo.createTask(db, { seasonId, title: "No date" });

    const allOpen = repo.listTasks(db, seasonId, { status: "open" });
    expect(allOpen).toHaveLength(4);

    const todayStr = today.toISOString().split("T")[0];
    const weekEnd = new Date(today.getTime() + 7 * 86400000).toISOString().split("T")[0];

    const overdue = allOpen.filter(t => t.due_at && t.due_at < todayStr);
    const thisWeek = allOpen.filter(t => t.due_at && t.due_at >= todayStr && t.due_at <= weekEnd);
    const noDue = allOpen.filter(t => !t.due_at);

    expect(overdue).toHaveLength(1);
    expect(overdue[0].title).toBe("Overdue");
    expect(thisWeek).toHaveLength(1);
    expect(thisWeek[0].title).toBe("This week");
    expect(noDue).toHaveLength(1);
    expect(noDue[0].title).toBe("No date");
  });
});
