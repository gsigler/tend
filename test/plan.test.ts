import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initializeSchema } from "../src/db/schema";
import * as repo from "../src/db/repo";

describe("repo: seed plans", () => {
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

  test("create seed plan with all fields", () => {
    const plan = repo.createSeedPlan(db, {
      seasonId, crop: "snapdragon", variety: "Madame Butterfly",
      source: "Burpee", startType: "indoor", qtyToStart: 15, gridSquares: 12,
      spaceId, targetStartDate: "2026-03-15", targetHardenDate: "2026-04-20",
      targetTransplantDate: "2026-05-01", notes: "For flower boxes (5 ft)",
    });
    expect(plan.id).toStartWith("plan_");
    expect(plan.crop).toBe("snapdragon");
    expect(plan.variety).toBe("Madame Butterfly");
    expect(plan.source).toBe("Burpee");
    expect(plan.start_type).toBe("indoor");
    expect(plan.qty_to_start).toBe(15);
    expect(plan.grid_squares).toBe(12);
    expect(plan.space_id).toBe(spaceId);
    expect(plan.target_start_date).toBe("2026-03-15");
    expect(plan.target_harden_date).toBe("2026-04-20");
    expect(plan.target_transplant_date).toBe("2026-05-01");
    expect(plan.status).toBe("planned");
    expect(plan.notes).toBe("For flower boxes (5 ft)");
    expect(plan.started_at).toBeNull();
  });

  test("create minimal seed plan (direct sow)", () => {
    const plan = repo.createSeedPlan(db, {
      seasonId, crop: "peas", startType: "direct_sow", qtyToStart: 30,
      targetStartDate: "2026-03-20",
    });
    expect(plan.start_type).toBe("direct_sow");
    expect(plan.variety).toBeNull();
    expect(plan.source).toBeNull();
    expect(plan.target_harden_date).toBeNull();
  });

  test("list seed plans ordered by target start date", () => {
    repo.createSeedPlan(db, { seasonId, crop: "tomato", targetStartDate: "2026-03-01" });
    repo.createSeedPlan(db, { seasonId, crop: "pepper", targetStartDate: "2026-02-15" });
    repo.createSeedPlan(db, { seasonId, crop: "snapdragon", targetStartDate: "2026-03-15" });

    const plans = repo.listSeedPlans(db, seasonId);
    expect(plans).toHaveLength(3);
    expect(plans[0].crop).toBe("pepper");
    expect(plans[1].crop).toBe("tomato");
    expect(plans[2].crop).toBe("snapdragon");
  });

  test("filter plans by status", () => {
    const p1 = repo.createSeedPlan(db, { seasonId, crop: "tomato", targetStartDate: "2026-03-01" });
    repo.createSeedPlan(db, { seasonId, crop: "pepper", targetStartDate: "2026-02-15" });

    repo.updateSeedPlanStatus(db, p1.id, "started", { field: "started_at", value: "2026-03-01" });

    expect(repo.listSeedPlans(db, seasonId, { status: "planned" })).toHaveLength(1);
    expect(repo.listSeedPlans(db, seasonId, { status: "started" })).toHaveLength(1);
  });

  test("filter plans by start type", () => {
    repo.createSeedPlan(db, { seasonId, crop: "tomato", startType: "indoor" });
    repo.createSeedPlan(db, { seasonId, crop: "peas", startType: "direct_sow" });

    expect(repo.listSeedPlans(db, seasonId, { startType: "indoor" })).toHaveLength(1);
    expect(repo.listSeedPlans(db, seasonId, { startType: "direct_sow" })).toHaveLength(1);
  });

  test("update status sets date field", () => {
    const p = repo.createSeedPlan(db, { seasonId, crop: "tomato", targetStartDate: "2026-03-01" });

    const started = repo.updateSeedPlanStatus(db, p.id, "started", { field: "started_at", value: "2026-03-01" });
    expect(started!.status).toBe("started");
    expect(started!.started_at).toBe("2026-03-01");

    const hardened = repo.updateSeedPlanStatus(db, started!.id, "hardening", { field: "hardened_at", value: "2026-04-15" });
    expect(hardened!.status).toBe("hardening");
    expect(hardened!.hardened_at).toBe("2026-04-15");

    const transplanted = repo.updateSeedPlanStatus(db, hardened!.id, "transplanted", { field: "transplanted_at", value: "2026-05-01" });
    expect(transplanted!.status).toBe("transplanted");
    expect(transplanted!.transplanted_at).toBe("2026-05-01");
  });

  test("seedPlansNeedingAction finds overdue planned items", () => {
    repo.createSeedPlan(db, { seasonId, crop: "tomato", targetStartDate: "2026-03-01" });
    repo.createSeedPlan(db, { seasonId, crop: "pepper", targetStartDate: "2026-02-15" });
    repo.createSeedPlan(db, { seasonId, crop: "basil", targetStartDate: "2026-04-01" });

    const needing = repo.seedPlansNeedingAction(db, seasonId, "2026-03-15");
    expect(needing).toHaveLength(2);
    expect(needing[0].crop).toBe("pepper");
    expect(needing[1].crop).toBe("tomato");
  });

  test("seedPlansNeedingHarden finds started items with due harden dates", () => {
    const p = repo.createSeedPlan(db, { seasonId, crop: "tomato", targetStartDate: "2026-03-01", targetHardenDate: "2026-04-15" });
    repo.updateSeedPlanStatus(db, p.id, "started", { field: "started_at", value: "2026-03-01" });

    expect(repo.seedPlansNeedingHarden(db, seasonId, "2026-04-20")).toHaveLength(1);
    expect(repo.seedPlansNeedingHarden(db, seasonId, "2026-04-10")).toHaveLength(0);
  });

  test("seedPlansNeedingTransplant finds items ready to transplant", () => {
    const p = repo.createSeedPlan(db, { seasonId, crop: "tomato", targetTransplantDate: "2026-05-10" });
    repo.updateSeedPlanStatus(db, p.id, "started", { field: "started_at", value: "2026-03-01" });

    expect(repo.seedPlansNeedingTransplant(db, seasonId, "2026-05-15")).toHaveLength(1);
    expect(repo.seedPlansNeedingTransplant(db, seasonId, "2026-05-05")).toHaveLength(0);
  });
});

describe("service logic: seed plan task generation", () => {
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
    repo.createSeedPlan(db, { seasonId, crop: "tomato", startType: "indoor", targetStartDate: "2026-03-01" });
    repo.createSeedPlan(db, { seasonId, crop: "peas", startType: "direct_sow", targetStartDate: "2026-03-20" });

    // Simulate generateTasksFromPlans logic
    const plans = repo.listSeedPlans(db, seasonId);
    const tasks: repo.Task[] = [];
    for (const p of plans) {
      if (p.status === "planned" && p.target_start_date) {
        const action = p.start_type === "indoor" ? "Start indoors" : "Direct sow";
        const task = repo.createTask(db, {
          seasonId, title: `${action}: ${p.crop}`, type: "seed_start",
          priority: "high", dueAt: p.target_start_date,
          notes: `Auto-generated from seed plan ${p.id}`,
        });
        tasks.push(task);
      }
    }
    expect(tasks).toHaveLength(2);
    expect(tasks[0].title).toBe("Start indoors: tomato");
    expect(tasks[1].title).toBe("Direct sow: peas");
  });

  test("generates transplant tasks for started items", () => {
    const p = repo.createSeedPlan(db, { seasonId, crop: "tomato", targetTransplantDate: "2026-05-10" });
    repo.updateSeedPlanStatus(db, p.id, "started", { field: "started_at", value: "2026-03-01" });

    const plans = repo.listSeedPlans(db, seasonId);
    const tasks: repo.Task[] = [];
    for (const plan of plans) {
      if ((plan.status === "started" || plan.status === "hardening") && plan.target_transplant_date) {
        const task = repo.createTask(db, {
          seasonId, title: `Transplant: ${plan.crop}`, type: "transplant",
          priority: "high", dueAt: plan.target_transplant_date,
          notes: `Auto-generated from seed plan ${plan.id}`,
        });
        tasks.push(task);
      }
    }
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Transplant: tomato");
    expect(tasks[0].due_at).toBe("2026-05-10");
  });

  test("full plan lifecycle", () => {
    const p = repo.createSeedPlan(db, {
      seasonId, crop: "tomato", variety: "Cherokee Purple",
      source: "Johnny's", qtyToStart: 6, gridSquares: 4,
      targetStartDate: "2026-03-01", targetHardenDate: "2026-04-15",
      targetTransplantDate: "2026-05-10",
    });

    // Start
    repo.updateSeedPlanStatus(db, p.id, "started", { field: "started_at", value: "2026-03-01" });
    let plan = repo.getSeedPlan(db, p.id)!;
    expect(plan.status).toBe("started");
    expect(plan.started_at).toBe("2026-03-01");

    // Harden
    repo.updateSeedPlanStatus(db, plan.id, "hardening", { field: "hardened_at", value: "2026-04-16" });
    plan = repo.getSeedPlan(db, p.id)!;
    expect(plan.status).toBe("hardening");

    // Transplant
    repo.updateSeedPlanStatus(db, plan.id, "transplanted", { field: "transplanted_at", value: "2026-05-12" });
    plan = repo.getSeedPlan(db, p.id)!;
    expect(plan.status).toBe("transplanted");
    expect(plan.transplanted_at).toBe("2026-05-12");
  });
});
