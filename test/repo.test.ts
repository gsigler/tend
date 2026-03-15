import { describe, test, expect } from "bun:test";
import { createTestDb } from "./helpers";
import * as repo from "../src/db/repo";

describe("repo: gardens", () => {
  test("create and get a garden", () => {
    const db = createTestDb();
    const g = repo.createGarden(db, "Test Garden");
    expect(g.name).toBe("Test Garden");
    expect(g.id).toStartWith("garden_");

    const found = repo.getGarden(db, g.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Test Garden");
  });

  test("get non-existent garden returns null", () => {
    const db = createTestDb();
    expect(repo.getGarden(db, "garden_nope")).toBeNull();
  });
});

describe("repo: seasons", () => {
  test("create and list seasons", () => {
    const db = createTestDb();
    const g = repo.createGarden(db, "G");
    const s = repo.createSeason(db, { gardenId: g.id, year: 2026, name: "Spring 2026" });
    expect(s.id).toStartWith("season_");
    expect(s.status).toBe("active");
    expect(s.year).toBe(2026);

    const seasons = repo.listSeasons(db, g.id);
    expect(seasons).toHaveLength(1);
    expect(seasons[0].name).toBe("Spring 2026");
  });

  test("season defaults", () => {
    const db = createTestDb();
    const g = repo.createGarden(db, "G");
    const s = repo.createSeason(db, { gardenId: g.id, year: 2026, name: "S", lastFrostDate: "2026-04-15" });
    expect(s.last_frost_date).toBe("2026-04-15");
    expect(s.first_frost_date).toBeNull();
  });
});

describe("repo: spaces", () => {
  test("create space and list", () => {
    const db = createTestDb();
    const g = repo.createGarden(db, "G");
    const s = repo.createSeason(db, { gardenId: g.id, year: 2026, name: "S" });
    const sp = repo.createSpace(db, { seasonId: s.id, name: "bed-1", type: "raised_bed", width: 12, length: 2, unit: "ft" });
    expect(sp.id).toStartWith("space_");
    expect(sp.sort_order).toBe(1);

    const sp2 = repo.createSpace(db, { seasonId: s.id, name: "bed-2", type: "raised_bed" });
    expect(sp2.sort_order).toBe(2);

    const spaces = repo.listSpaces(db, s.id);
    expect(spaces).toHaveLength(2);
    expect(spaces[0].name).toBe("bed-1");
    expect(spaces[1].name).toBe("bed-2");
  });

  test("getSpaceByName", () => {
    const db = createTestDb();
    const g = repo.createGarden(db, "G");
    const s = repo.createSeason(db, { gardenId: g.id, year: 2026, name: "S" });
    repo.createSpace(db, { seasonId: s.id, name: "tray-a", type: "tray" });

    const found = repo.getSpaceByName(db, s.id, "tray-a");
    expect(found).not.toBeNull();
    expect(found!.type).toBe("tray");

    expect(repo.getSpaceByName(db, s.id, "nope")).toBeNull();
  });

  test("space layout mode defaults to none", () => {
    const db = createTestDb();
    const g = repo.createGarden(db, "G");
    const s = repo.createSeason(db, { gardenId: g.id, year: 2026, name: "S" });
    const sp = repo.createSpace(db, { seasonId: s.id, name: "c1", type: "container" });
    expect(sp.layout_mode).toBe("none");
  });
});

describe("repo: plantings", () => {
  function setup() {
    const db = createTestDb();
    const g = repo.createGarden(db, "G");
    const s = repo.createSeason(db, { gardenId: g.id, year: 2026, name: "S" });
    const sp = repo.createSpace(db, { seasonId: s.id, name: "bed-1", type: "raised_bed" });
    return { db, season: s, space: sp };
  }

  test("create planting with defaults", () => {
    const { db, season } = setup();
    const p = repo.createPlanting(db, { seasonId: season.id, crop: "tomato" });
    expect(p.crop).toBe("tomato");
    expect(p.stage).toBe("planned");
    expect(p.health).toBe("healthy");
    expect(p.source_type).toBe("seed");
    expect(p.space_id).toBeNull();
  });

  test("create transplanted planting sets transplanted_at", () => {
    const { db, season, space } = setup();
    const p = repo.createPlanting(db, {
      seasonId: season.id, spaceId: space.id, crop: "lettuce",
      variety: "buttercrunch", sourceType: "start", stage: "transplanted",
      startedAt: "2026-03-15",
    });
    expect(p.stage).toBe("transplanted");
    expect(p.transplanted_at).toBe("2026-03-15");
    expect(p.variety).toBe("buttercrunch");
  });

  test("list plantings with filters", () => {
    const { db, season, space } = setup();
    repo.createPlanting(db, { seasonId: season.id, spaceId: space.id, crop: "peas", stage: "direct_sown" });
    repo.createPlanting(db, { seasonId: season.id, crop: "tomato", stage: "planned" });

    expect(repo.listPlantings(db, season.id)).toHaveLength(2);
    expect(repo.listPlantings(db, season.id, { crop: "peas" })).toHaveLength(1);
    expect(repo.listPlantings(db, season.id, { stage: "planned" })).toHaveLength(1);
    expect(repo.listPlantings(db, season.id, { spaceId: space.id })).toHaveLength(1);
  });

  test("update planting stage", () => {
    const { db, season } = setup();
    const p = repo.createPlanting(db, { seasonId: season.id, crop: "peas", stage: "direct_sown" });
    const updated = repo.updatePlantingStage(db, p.id, "seedling");
    expect(updated!.stage).toBe("seedling");
  });

  test("update to transplanted sets transplanted_at", () => {
    const { db, season } = setup();
    const p = repo.createPlanting(db, { seasonId: season.id, crop: "tomato", stage: "seedling" });
    const updated = repo.updatePlantingStage(db, p.id, "transplanted", "2026-05-01");
    expect(updated!.transplanted_at).toBe("2026-05-01");
  });
});

describe("repo: events", () => {
  test("create and list events", () => {
    const db = createTestDb();
    const g = repo.createGarden(db, "G");
    const s = repo.createSeason(db, { gardenId: g.id, year: 2026, name: "S" });
    const sp = repo.createSpace(db, { seasonId: s.id, name: "bed-1", type: "raised_bed" });

    repo.createEvent(db, { seasonId: s.id, spaceId: sp.id, type: "observed", summary: "looks good", happenedAt: "2026-03-15" });
    repo.createEvent(db, { seasonId: s.id, spaceId: sp.id, type: "note", summary: "watered", happenedAt: "2026-03-16" });

    const events = repo.listEvents(db, s.id);
    expect(events).toHaveLength(2);
    expect(events[0].happened_at).toBe("2026-03-16"); // most recent first
  });

  test("filter events by space", () => {
    const db = createTestDb();
    const g = repo.createGarden(db, "G");
    const s = repo.createSeason(db, { gardenId: g.id, year: 2026, name: "S" });
    const sp1 = repo.createSpace(db, { seasonId: s.id, name: "bed-1", type: "raised_bed" });
    const sp2 = repo.createSpace(db, { seasonId: s.id, name: "bed-2", type: "raised_bed" });

    repo.createEvent(db, { seasonId: s.id, spaceId: sp1.id, type: "note", summary: "a", happenedAt: "2026-03-15" });
    repo.createEvent(db, { seasonId: s.id, spaceId: sp2.id, type: "note", summary: "b", happenedAt: "2026-03-15" });

    expect(repo.listEvents(db, s.id, { spaceId: sp1.id })).toHaveLength(1);
  });

  test("limit events", () => {
    const db = createTestDb();
    const g = repo.createGarden(db, "G");
    const s = repo.createSeason(db, { gardenId: g.id, year: 2026, name: "S" });

    for (let i = 0; i < 10; i++) {
      repo.createEvent(db, { seasonId: s.id, type: "note", summary: `e${i}`, happenedAt: `2026-03-${String(i + 1).padStart(2, "0")}` });
    }

    expect(repo.listEvents(db, s.id, { limit: 3 })).toHaveLength(3);
  });
});

describe("repo: tasks", () => {
  test("create and list tasks", () => {
    const db = createTestDb();
    const g = repo.createGarden(db, "G");
    const s = repo.createSeason(db, { gardenId: g.id, year: 2026, name: "S" });

    const t = repo.createTask(db, { seasonId: s.id, title: "Water bed-1", type: "maintenance", priority: "high", dueAt: "2026-03-20" });
    expect(t.status).toBe("open");
    expect(t.priority).toBe("high");
    expect(t.completed_at).toBeNull();

    const tasks = repo.listTasks(db, s.id);
    expect(tasks).toHaveLength(1);
  });

  test("complete a task", () => {
    const db = createTestDb();
    const g = repo.createGarden(db, "G");
    const s = repo.createSeason(db, { gardenId: g.id, year: 2026, name: "S" });
    const t = repo.createTask(db, { seasonId: s.id, title: "Weed" });

    const done = repo.completeTask(db, t.id);
    expect(done!.status).toBe("done");
    expect(done!.completed_at).not.toBeNull();
  });

  test("filter tasks by status", () => {
    const db = createTestDb();
    const g = repo.createGarden(db, "G");
    const s = repo.createSeason(db, { gardenId: g.id, year: 2026, name: "S" });
    const t1 = repo.createTask(db, { seasonId: s.id, title: "A" });
    repo.createTask(db, { seasonId: s.id, title: "B" });
    repo.completeTask(db, t1.id);

    expect(repo.listTasks(db, s.id, { status: "open" })).toHaveLength(1);
    expect(repo.listTasks(db, s.id, { status: "done" })).toHaveLength(1);
  });

  test("tasks ordered by priority then due date", () => {
    const db = createTestDb();
    const g = repo.createGarden(db, "G");
    const s = repo.createSeason(db, { gardenId: g.id, year: 2026, name: "S" });
    repo.createTask(db, { seasonId: s.id, title: "Low", priority: "low", dueAt: "2026-03-15" });
    repo.createTask(db, { seasonId: s.id, title: "High", priority: "high", dueAt: "2026-03-20" });
    repo.createTask(db, { seasonId: s.id, title: "Medium", priority: "medium", dueAt: "2026-03-10" });

    const tasks = repo.listTasks(db, s.id);
    expect(tasks[0].title).toBe("High");
    expect(tasks[1].title).toBe("Medium");
    expect(tasks[2].title).toBe("Low");
  });
});
