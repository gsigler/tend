#!/usr/bin/env bun
import { Command } from "commander";
import { initCommand } from "./commands/init";
import { seasonCreate, seasonUse, seasonList } from "./commands/season";
import { readConfig, getDb } from "./db/connection";
import * as garden from "./services/garden";
import * as repo from "./db/repo";
import { handleError, output } from "./commands/output";
import { TendError } from "./services/errors";
import {
  validateSpaceType, validateLayoutMode, validateSourceType, validateStage,
  validateTaskType, validatePriority, validateEventType, validateStartType, validatePlanStatus,
} from "./commands/validate";

const program = new Command();

program
  .name("tend")
  .description("Local-first CLI for tracking and managing a personal garden")
  .version("0.1.0");

// Helper to resolve space name → ID
function resolveSpaceId(spaceName?: string): string | undefined {
  if (!spaceName) return undefined;
  const config = readConfig();
  const db = getDb();
  const space = repo.getSpaceByName(db, config.defaultSeasonId, spaceName);
  if (!space) throw new TendError("NOT_FOUND", `Space '${spaceName}' not found`);
  return space.id;
}

// Helper to build space ID→name map
function buildSpaceMap(): Map<string, string> {
  const config = readConfig();
  const spaces = garden.listSpaces(config.defaultSeasonId);
  return new Map(spaces.map(s => [s.id, s.name]));
}

// --- init ---
program
  .command("init")
  .description("Initialize a new garden workspace")
  .option("--name <name>", "Garden name", "My Garden")
  .option("--year <year>", "Starting year", String(new Date().getFullYear()))
  .option("--last-frost <date>", "Last frost date (YYYY-MM-DD)")
  .option("--first-frost <date>", "First frost date (YYYY-MM-DD)")
  .option("--force", "Reinitialize even if already set up", false)
  .action((opts) => {
    try {
      initCommand({ name: opts.name, year: parseInt(opts.year), lastFrost: opts.lastFrost, firstFrost: opts.firstFrost, force: opts.force });
    } catch (e) { handleError(e, false); }
  });

// --- summary ---
program
  .command("summary")
  .description("Show current garden state")
  .option("--json", "Output as JSON", false)
  .action((opts) => {
    try {
      const config = readConfig();
      const data = garden.getSummary(config.defaultSeasonId);
      if (opts.json) {
        output(data, true);
      } else {
        const spaceMap = new Map(data.spaces.map(s => [s.id, s.name]));
        console.log(`\nGarden: ${data.garden?.name ?? "Unknown"}`);
        console.log(`Season: ${data.season?.name ?? "Unknown"} [${data.season?.status}]`);
        if (data.season?.last_frost_date) console.log(`Last frost: ${data.season.last_frost_date}`);
        if (data.season?.first_frost_date) console.log(`First frost: ${data.season.first_frost_date}`);
        console.log(`\nSpaces (${data.spaces.length}):`);
        for (const s of data.spaces) {
          const dims = s.width && s.length ? ` ${s.width}x${s.length}${s.unit ?? ""}` : "";
          console.log(`  ${s.name} (${s.type})${dims}`);
        }
        console.log(`\nPlantings (${data.plantings.length}):`);
        for (const p of data.plantings) {
          const spaceName = p.space_id ? spaceMap.get(p.space_id) ?? p.space_id : "";
          console.log(`  ${p.crop}${p.variety ? ` - ${p.variety}` : ""} [${p.stage}]${spaceName ? ` in ${spaceName}` : ""}`);
        }
        if (data.seedPlans.length > 0) {
          const activePlans = data.seedPlans.filter(p => !["done", "skipped", "transplanted", "direct_sown"].includes(p.status));
          console.log(`\nSeed Plans (${activePlans.length} active, ${data.seedPlans.length} total):`);
          for (const p of activePlans) {
            console.log(`  ${p.crop}${p.variety ? ` - ${p.variety}` : ""} [${p.status}]${p.target_start_date ? ` start ${p.target_start_date}` : ""}`);
          }
        }
        console.log(`\nOpen Tasks (${data.openTasks.length}):`);
        for (const t of data.openTasks) console.log(`  [${t.priority}] ${t.title}${t.due_at ? ` (due ${t.due_at})` : ""}`);
      }
    } catch (e) { handleError(e, opts.json); }
  });

// --- week ---
program
  .command("week")
  .description("Show weekly work plan")
  .option("--json", "Output as JSON", false)
  .action((opts) => {
    try {
      const config = readConfig();
      const plan = garden.getWeekPlan(config.defaultSeasonId);
      if (opts.json) {
        output(plan, true);
      } else {
        console.log("\n--- Weekly Plan ---\n");
        if (plan.overdue.length > 0) {
          console.log("OVERDUE:");
          for (const t of plan.overdue) console.log(`  [${t.priority}] ${t.title} (due ${t.due_at})`);
        }
        if (plan.thisWeek.length > 0) {
          console.log("\nThis Week:");
          for (const t of plan.thisWeek) console.log(`  [${t.priority}] ${t.title} (due ${t.due_at})`);
        }
        if (plan.noDue.length > 0) {
          console.log("\nNo Due Date:");
          for (const t of plan.noDue) console.log(`  [${t.priority}] ${t.title}`);
        }
        if (plan.suggestions.length > 0) {
          console.log("\nSuggested Checks:");
          for (const s of plan.suggestions) console.log(`  → ${s}`);
        }
        // Only show plan actions that don't already have generated tasks
        const taskTitles = new Set([...plan.overdue, ...plan.thisWeek].map(t => t.title));
        const uniquePlanActions = plan.planActions.filter(a => {
          const expectedTitle = `${a.action.replace("OVERDUE: ", "").replace("Start seeds", a.plan.start_type === "indoor" ? "Start indoors" : "Direct sow")}: ${a.plan.crop}${a.plan.variety ? ` (${a.plan.variety})` : ""}`;
          return !taskTitles.has(expectedTitle);
        });
        if (uniquePlanActions.length > 0) {
          console.log("\nSeed Plan Actions:");
          for (const a of uniquePlanActions) {
            console.log(`  ${a.targetDate} | ${a.action}: ${a.plan.crop}${a.plan.variety ? ` (${a.plan.variety})` : ""}${a.plan.qty_to_start ? ` x${a.plan.qty_to_start}` : ""}`);
          }
        }
        if (plan.overdue.length === 0 && plan.thisWeek.length === 0 && plan.noDue.length === 0 && plan.suggestions.length === 0 && uniquePlanActions.length === 0) {
          console.log("  Nothing to do this week!");
        }
      }
    } catch (e) { handleError(e, opts.json); }
  });

// --- season ---
const seasonCmd = program.command("season").description("Manage seasons");

seasonCmd
  .command("create")
  .description("Create a new season")
  .requiredOption("--name <name>", "Season name")
  .requiredOption("--year <year>", "Year")
  .option("--last-frost <date>", "Last frost date")
  .option("--first-frost <date>", "First frost date")
  .action((opts) => {
    try {
      seasonCreate({ name: opts.name, year: parseInt(opts.year), lastFrost: opts.lastFrost, firstFrost: opts.firstFrost });
    } catch (e) { handleError(e, false); }
  });

seasonCmd
  .command("use <seasonId>")
  .description("Set the active season")
  .action((seasonId) => {
    try { seasonUse(seasonId); } catch (e) { handleError(e, false); }
  });

seasonCmd
  .command("list")
  .description("List all seasons")
  .option("--json", "Output as JSON", false)
  .action((opts) => {
    try { seasonList(opts.json); } catch (e) { handleError(e, opts.json); }
  });

// --- spaces ---
const spacesCmd = program.command("spaces").description("Manage growing spaces");

spacesCmd
  .command("add <name>")
  .description("Add a growing space")
  .requiredOption("--type <type>", "Space type (raised_bed, tray, container, row_bed, shelf, hardening_area)")
  .option("--layout <mode>", "Layout mode (square_foot_grid, rows, cell_grid, none)", "none")
  .option("--width <n>", "Width")
  .option("--length <n>", "Length")
  .option("--unit <unit>", "Unit (ft, in, m, cm)")
  .option("--notes <text>", "Notes")
  .action((name, opts) => {
    try {
      validateSpaceType(opts.type);
      validateLayoutMode(opts.layout);
      const config = readConfig();
      const space = garden.addSpace({
        seasonId: config.defaultSeasonId,
        name,
        type: opts.type,
        layoutMode: opts.layout,
        width: opts.width ? parseFloat(opts.width) : undefined,
        length: opts.length ? parseFloat(opts.length) : undefined,
        unit: opts.unit,
        notes: opts.notes,
      });
      console.log(`Added space: ${space.name} (${space.id})`);
    } catch (e) { handleError(e, false); }
  });

spacesCmd
  .command("remove <name>")
  .description("Remove a growing space")
  .action((name) => {
    try {
      const config = readConfig();
      const space = garden.removeSpace(config.defaultSeasonId, name);
      console.log(`Removed space: ${space.name}`);
    } catch (e) { handleError(e, false); }
  });

spacesCmd
  .command("list")
  .description("List growing spaces")
  .option("--json", "Output as JSON", false)
  .action((opts) => {
    try {
      const config = readConfig();
      const spaces = garden.listSpaces(config.defaultSeasonId);
      if (opts.json) {
        output(spaces, true);
      } else {
        if (spaces.length === 0) { console.log("No spaces defined."); return; }
        for (const s of spaces) {
          const dims = s.width && s.length ? ` ${s.width}x${s.length}${s.unit ? s.unit : ""}` : "";
          console.log(`  ${s.name} (${s.type})${dims} [${s.layout_mode}]`);
        }
      }
    } catch (e) { handleError(e, opts.json); }
  });

// --- plantings ---
const plantingsCmd = program.command("plantings").description("Manage plantings");

plantingsCmd
  .command("add <crop>")
  .description("Add a planting")
  .option("--space <name>", "Space name")
  .option("--variety <variety>", "Variety")
  .option("--source <type>", "Source type (seed, start)", "seed")
  .option("--stage <stage>", "Stage", "planned")
  .option("--qty <n>", "Quantity")
  .option("--qty-unit <unit>", "Quantity unit")
  .option("--date <date>", "Start date")
  .option("--notes <text>", "Notes")
  .action((crop, opts) => {
    try {
      validateSourceType(opts.source);
      validateStage(opts.stage);
      const config = readConfig();
      const spaceId = resolveSpaceId(opts.space);
      const planting = garden.addPlanting({
        seasonId: config.defaultSeasonId,
        spaceId,
        crop,
        variety: opts.variety,
        sourceType: opts.source,
        stage: opts.stage,
        quantity: opts.qty ? parseFloat(opts.qty) : undefined,
        quantityUnit: opts.qtyUnit,
        startedAt: opts.date,
        notes: opts.notes,
      });
      console.log(`Added planting: ${planting.crop}${planting.variety ? ` (${planting.variety})` : ""} [${planting.stage}] (${planting.id})`);
    } catch (e) { handleError(e, false); }
  });

plantingsCmd
  .command("list")
  .description("List plantings")
  .option("--space <name>", "Filter by space name")
  .option("--stage <stage>", "Filter by stage")
  .option("--crop <crop>", "Filter by crop")
  .option("--json", "Output as JSON", false)
  .action((opts) => {
    try {
      const config = readConfig();
      const spaceId = resolveSpaceId(opts.space);
      const plantings = garden.listPlantings(config.defaultSeasonId, { spaceId, stage: opts.stage, crop: opts.crop });
      if (opts.json) {
        output(plantings, true);
      } else {
        if (plantings.length === 0) { console.log("No plantings found."); return; }
        const spaceMap = buildSpaceMap();
        for (const p of plantings) {
          const spaceName = p.space_id ? spaceMap.get(p.space_id) ?? p.space_id : "";
          console.log(`  ${p.id} | ${p.crop}${p.variety ? ` - ${p.variety}` : ""} [${p.stage}] [${p.health}]${spaceName ? ` in ${spaceName}` : ""}`);
        }
      }
    } catch (e) { handleError(e, opts.json); }
  });

plantingsCmd
  .command("update-stage <plantingIdOrCrop> <stage>")
  .description("Update a planting's stage (by ID or crop name)")
  .option("--date <date>", "Date of stage change")
  .action((plantingIdOrCrop, stage, opts) => {
    try {
      validateStage(stage);
      const planting = garden.updatePlantingStage(plantingIdOrCrop, stage, opts.date);
      console.log(`Updated ${planting!.crop} to stage: ${stage}`);
    } catch (e) { handleError(e, false); }
  });

// --- tasks ---
const tasksCmd = program.command("tasks").description("Manage tasks");

tasksCmd
  .command("add <title>")
  .description("Add a task")
  .option("--space <name>", "Space name")
  .option("--type <type>", "Task type (seed_start, transplant, check, harvest, maintenance, other)", "other")
  .option("--priority <priority>", "Priority (low, medium, high)", "medium")
  .option("--due <date>", "Due date (YYYY-MM-DD)")
  .option("--notes <text>", "Notes")
  .action((title, opts) => {
    try {
      validateTaskType(opts.type);
      validatePriority(opts.priority);
      const config = readConfig();
      const spaceId = resolveSpaceId(opts.space);
      const task = garden.addTask({
        seasonId: config.defaultSeasonId,
        spaceId,
        title,
        type: opts.type,
        priority: opts.priority,
        dueAt: opts.due,
        notes: opts.notes,
      });
      console.log(`Added task: ${task.title} (${task.id})`);
    } catch (e) { handleError(e, false); }
  });

tasksCmd
  .command("list")
  .description("List tasks (defaults to open only)")
  .option("--status <status>", "Filter by status (open, done, skipped)")
  .option("--all", "Show all tasks including done", false)
  .option("--space <name>", "Filter by space name")
  .option("--due-before <date>", "Filter by due date")
  .option("--json", "Output as JSON", false)
  .action((opts) => {
    try {
      const config = readConfig();
      const spaceId = resolveSpaceId(opts.space);
      const status = opts.all ? undefined : (opts.status ?? "open");
      const tasks = garden.listTasks(config.defaultSeasonId, { status, spaceId, dueBefore: opts.dueBefore });
      if (opts.json) {
        output(tasks, true);
      } else {
        if (tasks.length === 0) { console.log("No tasks found."); return; }
        for (const t of tasks) {
          const icon = t.status === "done" ? "✓" : t.status === "skipped" ? "–" : "○";
          console.log(`  ${icon} ${t.id} | [${t.priority}] ${t.title}${t.due_at ? ` (due ${t.due_at})` : ""} [${t.status}]`);
        }
      }
    } catch (e) { handleError(e, opts.json); }
  });

tasksCmd
  .command("done <taskIdOrTitle>")
  .description("Mark a task as done (by ID or title search)")
  .action((taskIdOrTitle) => {
    try {
      const task = garden.completeTask(taskIdOrTitle);
      console.log(`Completed: ${task!.title}`);
    } catch (e) { handleError(e, false); }
  });

// --- events ---
const eventsCmd = program.command("events").description("View garden timeline");

eventsCmd
  .command("list")
  .description("List events")
  .option("--planting <id>", "Filter by planting ID")
  .option("--space <name>", "Filter by space name")
  .option("--limit <n>", "Limit results", "50")
  .option("--json", "Output as JSON", false)
  .action((opts) => {
    try {
      const config = readConfig();
      const spaceId = resolveSpaceId(opts.space);
      const events = garden.listEvents(config.defaultSeasonId, {
        plantingId: opts.planting,
        spaceId,
        limit: parseInt(opts.limit),
      });
      if (opts.json) {
        output(events, true);
      } else {
        if (events.length === 0) { console.log("No events found."); return; }
        for (const e of events) {
          console.log(`  ${e.happened_at.split("T")[0]} [${e.type}] ${e.summary}`);
        }
      }
    } catch (e) { handleError(e, opts.json); }
  });

// --- log ---
program
  .command("log")
  .description("Add a journal entry / event")
  .option("--space <name>", "Space name")
  .option("--planting <id>", "Planting ID")
  .option("--type <type>", "Event type (observed, harvested, note, etc.)", "note")
  .requiredOption("--note <text>", "Note / summary (required)")
  .option("--data <json>", "Additional JSON data")
  .option("--date <date>", "Date (YYYY-MM-DD)")
  .action((opts) => {
    try {
      validateEventType(opts.type);
      const config = readConfig();
      const spaceId = resolveSpaceId(opts.space);
      const event = garden.logEvent({
        seasonId: config.defaultSeasonId,
        spaceId,
        plantingId: opts.planting,
        type: opts.type,
        happenedAt: opts.date,
        summary: opts.note,
        dataJson: opts.data,
      });
      console.log(`Logged: [${event.type}] ${event.summary} (${event.id})`);
    } catch (e) { handleError(e, false); }
  });

// --- plan ---
const planCmd = program.command("plan").description("Manage seed starting schedule");

planCmd
  .command("add <crop>")
  .description("Add a crop to the seed starting plan")
  .option("--variety <variety>", "Variety name")
  .option("--source <source>", "Seed source (e.g. Burpee, Johnny's)")
  .option("--start-type <type>", "Start type (indoor, direct_sow)", "indoor")
  .option("--qty <n>", "Number of seeds to start")
  .option("--grid <n>", "Garden grid squares needed")
  .option("--space <name>", "Target space name")
  .option("--start-date <date>", "Target start date (YYYY-MM-DD)")
  .option("--harden-date <date>", "Target hardening date (YYYY-MM-DD)")
  .option("--transplant-date <date>", "Target transplant date (YYYY-MM-DD)")
  .option("--notes <text>", "Notes")
  .action((crop, opts) => {
    try {
      validateStartType(opts.startType);
      const config = readConfig();
      const spaceId = resolveSpaceId(opts.space);
      const plan = garden.addSeedPlan({
        seasonId: config.defaultSeasonId,
        crop,
        variety: opts.variety,
        source: opts.source,
        startType: opts.startType,
        qtyToStart: opts.qty ? parseInt(opts.qty) : undefined,
        gridSquares: opts.grid ? parseInt(opts.grid) : undefined,
        spaceId,
        targetStartDate: opts.startDate,
        targetHardenDate: opts.hardenDate,
        targetTransplantDate: opts.transplantDate,
        notes: opts.notes,
      });
      console.log(`Added to plan: ${plan.crop}${plan.variety ? ` (${plan.variety})` : ""} [${plan.start_type}]`);
      if (plan.target_start_date) console.log(`  Start: ${plan.target_start_date}`);
      if (plan.target_harden_date) console.log(`  Harden: ${plan.target_harden_date}`);
      if (plan.target_transplant_date) console.log(`  Transplant: ${plan.target_transplant_date}`);
      console.log(`  ID: ${plan.id}`);
    } catch (e) { handleError(e, false); }
  });

planCmd
  .command("list")
  .description("List all seed plans")
  .option("--status <status>", "Filter by status")
  .option("--start-type <type>", "Filter by start type")
  .option("--json", "Output as JSON", false)
  .action((opts) => {
    try {
      const config = readConfig();
      const plans = garden.listSeedPlans(config.defaultSeasonId, { status: opts.status, startType: opts.startType });
      if (opts.json) {
        output(plans, true);
      } else {
        if (plans.length === 0) { console.log("No seed plans found."); return; }
        console.log("");
        for (const p of plans) {
          const src = p.source ? ` (${p.source})` : "";
          const qty = p.qty_to_start ? ` x${p.qty_to_start}` : "";
          const grid = p.grid_squares ? ` [${p.grid_squares} sq]` : "";
          console.log(`  ${p.crop}${p.variety ? ` - ${p.variety}` : ""}${src}${qty}${grid}`);
          console.log(`    Type: ${p.start_type} | Status: ${p.status}`);
          if (p.target_start_date) console.log(`    Start: ${p.target_start_date}${p.started_at ? ` (done ${p.started_at})` : ""}`);
          if (p.target_harden_date) console.log(`    Harden: ${p.target_harden_date}${p.hardened_at ? ` (done ${p.hardened_at})` : ""}`);
          if (p.target_transplant_date) console.log(`    Transplant: ${p.target_transplant_date}${p.transplanted_at ? ` (done ${p.transplanted_at})` : ""}`);
          if (p.notes) console.log(`    Notes: ${p.notes}`);
          console.log(`    ID: ${p.id}`);
          console.log("");
        }
      }
    } catch (e) { handleError(e, opts.json); }
  });

planCmd
  .command("schedule")
  .description("Show seed starting schedule with next actions")
  .option("--json", "Output as JSON", false)
  .action((opts) => {
    try {
      const config = readConfig();
      const schedule = garden.getSeedSchedule(config.defaultSeasonId);
      if (opts.json) {
        output(schedule, true);
      } else {
        console.log("\n--- Seed Starting Schedule ---\n");
        if (schedule.overdue.length > 0) {
          console.log("OVERDUE:");
          for (const p of schedule.overdue) {
            console.log(`  ${p.next_date} | ${p.next_action}: ${p.crop}${p.variety ? ` (${p.variety})` : ""}${p.qty_to_start ? ` x${p.qty_to_start}` : ""}`);
          }
          console.log("");
        }
        if (schedule.upcoming.length > 0) {
          console.log("Upcoming:");
          for (const p of schedule.upcoming) {
            console.log(`  ${p.next_date || "no date"} | ${p.next_action}: ${p.crop}${p.variety ? ` (${p.variety})` : ""}${p.qty_to_start ? ` x${p.qty_to_start}` : ""}`);
          }
          console.log("");
        }
        if (schedule.done.length > 0) {
          console.log(`Done (${schedule.done.length}):`);
          for (const p of schedule.done) {
            console.log(`  ${p.crop}${p.variety ? ` (${p.variety})` : ""} [${p.status}]`);
          }
        }
        if (schedule.overdue.length === 0 && schedule.upcoming.length === 0 && schedule.done.length === 0) {
          console.log("  No seed plans yet. Add one with: tend plan add <crop>");
        }
      }
    } catch (e) { handleError(e, opts.json); }
  });

planCmd
  .command("update <planIdOrCrop> <status>")
  .description("Update a seed plan status (by ID or crop name)")
  .option("--date <date>", "Date of status change (YYYY-MM-DD)")
  .action((planIdOrCrop, status, opts) => {
    try {
      validatePlanStatus(status);
      const plan = garden.updateSeedPlanStatus(planIdOrCrop, status, opts.date);
      console.log(`Updated: ${plan!.crop}${plan!.variety ? ` (${plan!.variety})` : ""} → ${status}`);
    } catch (e) { handleError(e, false); }
  });

planCmd
  .command("generate-tasks")
  .description("Auto-generate tasks from seed plan dates")
  .action(() => {
    try {
      const config = readConfig();
      const created = garden.generateTasksFromPlans(config.defaultSeasonId);
      if (created.length === 0) {
        console.log("No new tasks to generate. Plans are either complete or tasks already exist.");
      } else {
        console.log(`Generated ${created.length} task(s):`);
        for (const t of created) {
          console.log(`  [${t.priority}] ${t.title} (due ${t.due_at})`);
        }
      }
    } catch (e) { handleError(e, false); }
  });

program.parse();
