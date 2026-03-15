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

    // Verify config exists
    const configPath = join(tendDir, ".tend", "config.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(config.defaultGardenId).toStartWith("garden_");
    expect(config.defaultSeasonId).toStartWith("season_");
    expect(config.units).toBe("imperial");
  });

  test("spaces add and list", () => {
    cli("init --name G --year 2026");

    const addOut = cli("spaces add bed-1 --type raised_bed --width 12 --length 2 --unit ft");
    expect(addOut).toContain("Added space: bed-1");

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
    expect(addOut).toContain("Added planting: peas");

    cli("plantings add lettuce --space bed-1 --variety buttercrunch --source start --stage transplanted");

    const plantings = cliJson("plantings list --json");
    expect(plantings).toHaveLength(2);

    // Filter by crop
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
    expect(out).toContain("Updated peas to stage: seedling");

    const updated = cliJson("plantings list --json");
    expect(updated[0].stage).toBe("seedling");
  });

  test("tasks add, list, done", () => {
    cli("init --name G --year 2026");
    cli("spaces add bed-1 --type raised_bed");

    const addOut = cli("tasks add Check-peas --space bed-1 --type check --priority high --due 2026-03-20");
    expect(addOut).toContain("Added task: Check-peas");

    const tasks = cliJson("tasks list --json");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].priority).toBe("high");
    expect(tasks[0].status).toBe("open");

    const doneOut = cli(`tasks done ${tasks[0].id}`);
    expect(doneOut).toContain("Completed: Check-peas");

    const doneTasks = cliJson("tasks list --status done --json");
    expect(doneTasks).toHaveLength(1);
    expect(doneTasks[0].completed_at).not.toBeNull();
  });

  test("log and events list", () => {
    cli("init --name G --year 2026");
    cli("spaces add bed-1 --type raised_bed");

    const logOut = cli("log --space bed-1 --type observed --note soil-looks-dry --date 2026-03-16");
    expect(logOut).toContain("Logged: [observed]");

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
  });

  test("week --json returns structured data", () => {
    cli("init --name G --year 2026");

    const data = cliJson("week --json");
    expect(data.overdue).toBeArray();
    expect(data.thisWeek).toBeArray();
    expect(data.noDue).toBeArray();
    expect(data.suggestions).toBeArray();
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
});
