import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "bun";

// CLI integration tests run the actual CLI binary with a temporary TEND dir

let tendDir: string;

function cli(args: string): string {
  const result = spawnSync(["bun", "run", "src/cli.ts", ...args.split(" ")], {
    env: { ...process.env, HOME: tendDir },
    cwd: process.cwd(),
  });
  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();
  if (result.exitCode !== 0 && !stdout) throw new Error(stderr || `Exit code ${result.exitCode}`);
  return stdout;
}

function cliJson(args: string): any {
  return JSON.parse(cli(args));
}

describe("CLI integration", () => {
  beforeEach(() => {
    tendDir = mkdtempSync(join(tmpdir(), "tend-cli-test-"));
  });

  afterEach(() => {
    try { rmSync(tendDir, { recursive: true, force: true }); } catch {}
  });

  test("init creates config and database", () => {
    const out = cli("init --name TestGarden --year 2026");
    expect(out).toContain("Initialized tend");
    expect(out).toContain("TestGarden");

    const configPath = join(tendDir, ".tend", "config.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(config.defaultGardenId).toStartWith("garden_");
    expect(config.defaultSeasonId).toStartWith("season_");
    expect(config.units).toBe("imperial");
  });

  test("spaces add and list", () => {
    cli("init --name G --year 2026");

    const addOut = cli("spaces add bed-1 --type raised_bed --width 12 --length 2 --unit ft");
    expect(addOut).toContain("bed-1");
    expect(addOut).toContain("Raised Bed");

    cli("spaces add tray-a --type tray");

    const spaces = cliJson("spaces list --json");
    expect(spaces).toHaveLength(2);
    expect(spaces[0].name).toBe("bed-1");
    expect(spaces[0].type).toBe("raised_bed");
    expect(spaces[1].name).toBe("tray-a");
  });

  test("plantings add and list", () => {
    cli("init --name G --year 2026");
    cli("spaces add bed-1 --type raised_bed");

    const addOut = cli("plantings add peas --space bed-1 --source seed --stage direct_sown --date 2026-03-15");
    expect(addOut).toContain("peas");
    expect(addOut).toContain("Direct Sown");

    cli("plantings add lettuce --space bed-1 --variety buttercrunch --source start --stage transplanted");

    const plantings = cliJson("plantings list --json");
    expect(plantings).toHaveLength(2);

    const peasOnly = cliJson("plantings list --crop peas --json");
    expect(peasOnly).toHaveLength(1);
    expect(peasOnly[0].crop).toBe("peas");
  });

  test("plantings update-stage", () => {
    cli("init --name G --year 2026");
    cli("spaces add bed-1 --type raised_bed");
    cli("plantings add peas --space bed-1 --stage direct_sown");

    const plantings = cliJson("plantings list --json");
    const plantingId = plantings[0].id;

    const out = cli(`plantings update-stage ${plantingId} seedling --date 2026-04-01`);
    expect(out).toContain("peas");
    expect(out).toContain("Seedling");

    const updated = cliJson("plantings list --json");
    expect(updated[0].stage).toBe("seedling");
  });

  test("plantings update-stage by crop name", () => {
    cli("init --name G --year 2026");
    cli("plantings add tomato --stage seeded_indoors");

    const out = cli("plantings update-stage tomato seedling");
    expect(out).toContain("tomato");
    expect(out).toContain("Seedling");
  });

  test("plantings remove", () => {
    cli("init --name G --year 2026");
    cli("plantings add tomato --stage planned");

    const out = cli("plantings remove tomato");
    expect(out).toContain("Removed");
    expect(out).toContain("tomato");

    const plantings = cliJson("plantings list --json");
    expect(plantings).toHaveLength(0);
  });

  test("tasks add, list, done", () => {
    cli("init --name G --year 2026");
    cli("spaces add bed-1 --type raised_bed");

    const addOut = cli("tasks add Check-peas --space bed-1 --type check --priority high --due 2026-03-20");
    expect(addOut).toContain("Check-peas");

    const tasks = cliJson("tasks list --json");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].priority).toBe("high");
    expect(tasks[0].status).toBe("open");

    const doneOut = cli(`tasks done ${tasks[0].id}`);
    expect(doneOut).toContain("Check-peas");

    const doneTasks = cliJson("tasks list --status done --json");
    expect(doneTasks).toHaveLength(1);
    expect(doneTasks[0].completed_at).not.toBeNull();
  });

  test("tasks done by title search", () => {
    cli("init --name G --year 2026");
    cli("tasks add Water-the-beds --type maintenance");

    const out = cli("tasks done Water");
    expect(out).toContain("Water-the-beds");
  });

  test("tasks remove", () => {
    cli("init --name G --year 2026");
    cli("tasks add Weed --type maintenance");

    const out = cli("tasks remove Weed");
    expect(out).toContain("Removed");

    const tasks = cliJson("tasks list --json");
    expect(tasks).toHaveLength(0);
  });

  test("log and events list", () => {
    cli("init --name G --year 2026");
    cli("spaces add bed-1 --type raised_bed");

    const logOut = cli("log --space bed-1 --type observed --note soil-looks-dry --date 2026-03-16");
    expect(logOut).toContain("Logged");
    expect(logOut).toContain("Observed");

    cli("log --type note --note started-composting --date 2026-03-17");

    const events = cliJson("events list --json");
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.some((e: any) => e.type === "observed")).toBe(true);
  });

  test("summary includes all sections", () => {
    cli("init --name TestGarden --year 2026");
    cli("spaces add bed-1 --type raised_bed");
    cli("plantings add peas --space bed-1 --stage direct_sown");
    cli("tasks add Weed --type maintenance");

    const out = cli("summary");
    expect(out).toContain("TestGarden");
    expect(out).toContain("bed-1");
    expect(out).toContain("peas");
    expect(out).toContain("Weed");
  });

  test("summary --json returns structured data", () => {
    cli("init --name G --year 2026");
    cli("spaces add bed-1 --type raised_bed");

    const data = cliJson("summary --json");
    expect(data.garden).toBeDefined();
    expect(data.season).toBeDefined();
    expect(data.spaces).toBeArray();
    expect(data.plantings).toBeArray();
    expect(data.openTasks).toBeArray();
    expect(data.seedPlans).toBeArray();
  });

  test("week --json returns structured data", () => {
    cli("init --name G --year 2026");

    const data = cliJson("week --json");
    expect(data.overdue).toBeArray();
    expect(data.thisWeek).toBeArray();
    expect(data.noDue).toBeArray();
    expect(data.suggestions).toBeArray();
    expect(data.planActions).toBeArray();
  });

  test("season create and list", () => {
    cli("init --name G --year 2026");

    cli("season create --name Fall-2026 --year 2026");

    const seasons = cliJson("season list --json");
    expect(seasons).toHaveLength(2);
  });

  test("events list with --space filter", () => {
    cli("init --name G --year 2026");
    cli("spaces add bed-1 --type raised_bed");
    cli("spaces add bed-2 --type raised_bed");

    cli("log --space bed-1 --type observed --note note-for-bed-1");
    cli("log --space bed-2 --type observed --note note-for-bed-2");

    const bed1Events = cliJson("events list --space bed-1 --json");
    expect(bed1Events).toHaveLength(1);
    expect(bed1Events[0].summary).toContain("bed-1");
  });

  // --- Seed Plan CLI tests ---

  test("plan add and list", () => {
    cli("init --name G --year 2026");
    cli("spaces add bed-1 --type raised_bed");

    const out = cli("plan add snapdragon --variety Madame-Butterfly --source Burpee --qty 15 --grid 12 --space bed-1 --start-date 2026-03-15 --harden-date 2026-04-20 --transplant-date 2026-05-01 --notes flower-boxes");
    expect(out).toContain("Added to plan: snapdragon");
    expect(out).toContain("Indoor");

    const plans = cliJson("plan list --json");
    expect(plans).toHaveLength(1);
    expect(plans[0].crop).toBe("snapdragon");
    expect(plans[0].source).toBe("Burpee");
    expect(plans[0].qty_to_start).toBe(15);
    expect(plans[0].grid_squares).toBe(12);
    expect(plans[0].target_start_date).toBe("2026-03-15");
  });

  test("plan add direct sow", () => {
    cli("init --name G --year 2026");

    cli("plan add peas --start-type direct_sow --qty 30 --start-date 2026-03-20");

    const plans = cliJson("plan list --json");
    expect(plans[0].start_type).toBe("direct_sow");
  });

  test("plan schedule shows overdue and upcoming", () => {
    cli("init --name G --year 2026");

    cli("plan add pepper --start-date 2026-01-01");
    cli("plan add basil --start-date 2099-06-01");

    const schedule = cliJson("plan schedule --json");
    expect(schedule.overdue.length).toBeGreaterThanOrEqual(1);
    expect(schedule.overdue[0].crop).toBe("pepper");
    expect(schedule.upcoming.length).toBeGreaterThanOrEqual(1);
    expect(schedule.upcoming[0].crop).toBe("basil");
  });

  test("plan update changes status", () => {
    cli("init --name G --year 2026");
    cli("plan add tomato --start-date 2026-03-01");

    const plans = cliJson("plan list --json");
    const planId = plans[0].id;

    const out = cli(`plan update ${planId} started --date 2026-03-01`);
    expect(out).toContain("Started");

    const updated = cliJson("plan list --json");
    expect(updated[0].status).toBe("started");
    expect(updated[0].started_at).toBe("2026-03-01");
  });

  test("plan update by crop name", () => {
    cli("init --name G --year 2026");
    cli("plan add basil --start-date 2026-03-15");

    const out = cli("plan update basil started --date 2026-03-15");
    expect(out).toContain("basil");
    expect(out).toContain("Started");
  });

  test("plan remove", () => {
    cli("init --name G --year 2026");
    cli("plan add tomato --start-date 2026-03-01");

    const out = cli("plan remove tomato");
    expect(out).toContain("Removed");
    expect(out).toContain("tomato");

    const plans = cliJson("plan list --json");
    expect(plans).toHaveLength(0);
  });

  test("plan generate-tasks creates tasks from plan dates", () => {
    cli("init --name G --year 2026");
    cli("plan add tomato --start-date 2026-03-01");
    cli("plan add peas --start-type direct_sow --start-date 2026-03-20");

    const out = cli("plan generate-tasks");
    expect(out).toContain("Generated 2 task(s)");
    expect(out).toContain("Start indoors: tomato");
    expect(out).toContain("Direct sow: peas");

    const tasks = cliJson("tasks list --json");
    expect(tasks).toHaveLength(2);
  });

  test("plan generate-tasks is idempotent", () => {
    cli("init --name G --year 2026");
    cli("plan add tomato --start-date 2026-03-01");

    cli("plan generate-tasks");
    const out = cli("plan generate-tasks");
    expect(out).toContain("No new tasks to generate");

    const tasks = cliJson("tasks list --json");
    expect(tasks).toHaveLength(1);
  });

  test("week shows seed plan actions", () => {
    cli("init --name G --year 2026");
    cli("plan add pepper --start-date 2026-01-01");

    const week = cliJson("week --json");
    expect(week.planActions).toBeArray();
    expect(week.planActions.length).toBeGreaterThanOrEqual(1);
    expect(week.planActions[0].plan.crop).toBe("pepper");
  });

  test("spaces remove", () => {
    cli("init --name G --year 2026");
    cli("spaces add bed-1 --type raised_bed");

    const out = cli("spaces remove bed-1");
    expect(out).toContain("Removed");

    const spaces = cliJson("spaces list --json");
    expect(spaces).toHaveLength(0);
  });

  test("duplicate space names rejected", () => {
    cli("init --name G --year 2026");
    cli("spaces add bed-1 --type raised_bed");

    let threw = false;
    try { cli("spaces add bed-1 --type tray"); } catch { threw = true; }
    expect(threw).toBe(true);
  });

  test("invalid types give friendly errors", () => {
    cli("init --name G --year 2026");

    let threw = false;
    try { cli("spaces add bad --type greenhouse"); } catch { threw = true; }
    expect(threw).toBe(true);
  });
});
