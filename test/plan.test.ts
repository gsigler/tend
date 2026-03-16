import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initializeSchema } from "../src/db/schema";
import * as repo from "../src/db/repo";

describe("repo: planting schedule fields", () => {
  let db: Database;
  let seasonId: string;
  let spaceId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys=ON");
    initializeSchema(db);
    const g = repo.createGarden(db, "G");
    const s = repo.createSeason(db, { gardenId: g.id, year: 2026, name: "S", lastFrostDate: "2026-04-15" });
    seasonId = s.id;
    const sp = repo.createSpace(db, { seasonId, name: "bed-1", type: "raised_bed" });
    spaceId = sp.id;
  });

  test("create planting with all schedule fields", () => {
    const p = repo.createPlanting(db, {
      seasonId, crop: "snapdragon", variety: "Madame Butterfly",
      source: "Burpee", sourceType: "seed", quantity: 15, gridSquares: 12,
      spaceId, targetStartDate: "2026-03-15", targetHardenDate: "2026-04-20",
      targetTransplantDate: "2026-05-01", notes: "For flower boxes (5 ft)",
    });
    expect(p.id).toStartWith("planting_");
    expect(p.crop).toBe("snapdragon");
    expect(p.variety).toBe("Madame Butterfly");
    expect(p.source).toBe("Burpee");
    expect(p.source_type).toBe("seed");
    expect(p.quantity).toBe(15);
    expect(p.grid_squares).toBe(12);
    expect(p.space_id).toBe(spaceId);
    expect(p.target_start_date).toBe("2026-03-15");
    expect(p.target_harden_date).toBe("2026-04-20");
    expect(p.target_transplant_date).toBe("2026-05-01");
    expect(p.stage).toBe("planned");
    expect(p.notes).toBe("For flower boxes (5 ft)");
    expect(p.started_at).toBeNull();
  });

  test("create minimal planting with schedule date", () => {
    const p = repo.createPlanting(db, {
      seasonId, crop: "peas", sourceType: "seed", quantity: 30,
      targetStartDate: "2026-03-20",
    });
    expect(p.source_type).toBe("seed");
    expect(p.variety).toBeNull();
    expect(p.source).toBeNull();
    expect(p.target_harden_date).toBeNull();
    expect(p.target_start_date).toBe("2026-03-20");
  });

  test("list scheduled plantings ordered by target start date", () => {
    repo.createPlanting(db, { seasonId, crop: "tomato", targetStartDate: "2026-03-01" });
    repo.createPlanting(db, { seasonId, crop: "pepper", targetStartDate: "2026-02-15" });
    repo.createPlanting(db, { seasonId, crop: "snapdragon", targetStartDate: "2026-03-15" });

    const scheduled = repo.listScheduledPlantings(db, seasonId);
    expect(scheduled).toHaveLength(3);
    expect(scheduled[0].crop).toBe("pepper");
    expect(scheduled[1].crop).toBe("tomato");
    expect(scheduled[2].crop).toBe("snapdragon");
  });

  test("update stage to seeded_indoors sets started_at", () => {
    const p = repo.createPlanting(db, { seasonId, crop: "tomato", targetStartDate: "2026-03-01" });

    const started = repo.updatePlantingStage(db, p.id, "seeded_indoors", "2026-03-01");
    expect(started!.stage).toBe("seeded_indoors");
    expect(started!.started_at).toBe("2026-03-01");
  });

  test("update stage to hardening_off sets hardened_at", () => {
    const p = repo.createPlanting(db, { seasonId, crop: "tomato" });
    repo.updatePlantingStage(db, p.id, "seeded_indoors", "2026-03-01");

    const hardened = repo.updatePlantingStage(db, p.id, "hardening_off", "2026-04-15");
    expect(hardened!.stage).toBe("hardening_off");
    expect(hardened!.hardened_at).toBe("2026-04-15");
  });

  test("update stage to transplanted sets transplanted_at", () => {
    const p = repo.createPlanting(db, { seasonId, crop: "tomato" });

    const transplanted = repo.updatePlantingStage(db, p.id, "transplanted", "2026-05-01");
    expect(transplanted!.stage).toBe("transplanted");
    expect(transplanted!.transplanted_at).toBe("2026-05-01");
  });

  test("plantingsNeedingStart finds overdue planned items", () => {
    repo.createPlanting(db, { seasonId, crop: "tomato", targetStartDate: "2026-03-01" });
    repo.createPlanting(db, { seasonId, crop: "pepper", targetStartDate: "2026-02-15" });
    repo.createPlanting(db, { seasonId, crop: "basil", targetStartDate: "2026-04-01" });

    const needing = repo.plantingsNeedingStart(db, seasonId, "2026-03-15");
    expect(needing).toHaveLength(2);
    expect(needing[0].crop).toBe("pepper");
    expect(needing[1].crop).toBe("tomato");
  });

  test("plantingsNeedingHarden finds seeded items with due harden dates", () => {
    const p = repo.createPlanting(db, { seasonId, crop: "tomato", targetStartDate: "2026-03-01", targetHardenDate: "2026-04-15" });
    repo.updatePlantingStage(db, p.id, "seeded_indoors", "2026-03-01");

    expect(repo.plantingsNeedingHarden(db, seasonId, "2026-04-20")).toHaveLength(1);
    expect(repo.plantingsNeedingHarden(db, seasonId, "2026-04-10")).toHaveLength(0);
  });

  test("plantingsNeedingTransplant finds items ready to transplant", () => {
    const p = repo.createPlanting(db, { seasonId, crop: "tomato", targetTransplantDate: "2026-05-10" });
    repo.updatePlantingStage(db, p.id, "seeded_indoors", "2026-03-01");

    expect(repo.plantingsNeedingTransplant(db, seasonId, "2026-05-15")).toHaveLength(1);
    expect(repo.plantingsNeedingTransplant(db, seasonId, "2026-05-05")).toHaveLength(0);
  });
});

describe("service logic: task generation from planting schedules", () => {
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

  test("generates start tasks for planned items with target dates", () => {
    repo.createPlanting(db, { seasonId, crop: "tomato", sourceType: "seed", targetStartDate: "2026-03-01" });
    repo.createPlanting(db, { seasonId, crop: "peas", sourceType: "start", targetStartDate: "2026-03-20" });

    const plantings = repo.listScheduledPlantings(db, seasonId);
    const tasks: repo.Task[] = [];
    for (const p of plantings) {
      if (p.stage === "planned" && p.target_start_date) {
        const action = p.source_type === "seed" ? "Start indoors" : "Direct sow";
        const task = repo.createTask(db, {
          seasonId, title: `${action}: ${p.crop}`, type: "seed_start",
          priority: "high", dueAt: p.target_start_date,
          notes: `Auto-generated from planting ${p.id}`,
        });
        tasks.push(task);
      }
    }
    expect(tasks).toHaveLength(2);
    expect(tasks[0].title).toBe("Start indoors: tomato");
    expect(tasks[1].title).toBe("Direct sow: peas");
  });

  test("generates transplant tasks for seeded items", () => {
    const p = repo.createPlanting(db, { seasonId, crop: "tomato", targetTransplantDate: "2026-05-10" });
    repo.updatePlantingStage(db, p.id, "seeded_indoors", "2026-03-01");

    const plantings = repo.listScheduledPlantings(db, seasonId);
    const tasks: repo.Task[] = [];
    for (const pl of plantings) {
      if ((pl.stage === "seeded_indoors" || pl.stage === "seedling" || pl.stage === "hardening_off") && pl.target_transplant_date) {
        const task = repo.createTask(db, {
          seasonId, title: `Transplant: ${pl.crop}`, type: "transplant",
          priority: "high", dueAt: pl.target_transplant_date,
          notes: `Auto-generated from planting ${pl.id}`,
        });
        tasks.push(task);
      }
    }
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Transplant: tomato");
    expect(tasks[0].due_at).toBe("2026-05-10");
  });

  test("full planting lifecycle with schedule dates", () => {
    const p = repo.createPlanting(db, {
      seasonId, crop: "tomato", variety: "Cherokee Purple",
      source: "Johnny's", quantity: 6, gridSquares: 4,
      targetStartDate: "2026-03-01", targetHardenDate: "2026-04-15",
      targetTransplantDate: "2026-05-10",
    });

    // Start
    repo.updatePlantingStage(db, p.id, "seeded_indoors", "2026-03-01");
    let planting = repo.getPlanting(db, p.id)!;
    expect(planting.stage).toBe("seeded_indoors");
    expect(planting.started_at).toBe("2026-03-01");

    // Harden
    repo.updatePlantingStage(db, planting.id, "hardening_off", "2026-04-16");
    planting = repo.getPlanting(db, p.id)!;
    expect(planting.stage).toBe("hardening_off");
    expect(planting.hardened_at).toBe("2026-04-16");

    // Transplant
    repo.updatePlantingStage(db, planting.id, "transplanted", "2026-05-12");
    planting = repo.getPlanting(db, p.id)!;
    expect(planting.stage).toBe("transplanted");
    expect(planting.transplanted_at).toBe("2026-05-12");
  });
});
