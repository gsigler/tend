#!/usr/bin/env bun
import { Command } from "commander";
import { initCommand } from "./commands/init";
import { seasonCreate, seasonUse, seasonList } from "./commands/season";
import { readConfig, getDb } from "./db/connection";
import * as garden from "./services/garden";
import * as repo from "./db/repo";
import { handleError, output } from "./commands/output";
import { TendError } from "./services/errors";

const program = new Command();

program
  .name("tend")
  .description("Local-first CLI for tracking and managing a personal garden")
  .version("0.1.0");

// --- init ---
program
  .command("init")
  .description("Initialize a new garden workspace")
  .option("--name <name>", "Garden name", "My Garden")
  .option("--year <year>", "Starting year", String(new Date().getFullYear()))
  .option("--last-frost <date>", "Last frost date (YYYY-MM-DD)")
  .option("--first-frost <date>", "First frost date (YYYY-MM-DD)")
  .action((opts) => {
    try {
      initCommand({ name: opts.name, year: parseInt(opts.year), lastFrost: opts.lastFrost, firstFrost: opts.firstFrost });
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
        console.log(`\nGarden: ${data.garden?.name ?? "Unknown"}`);
        console.log(`Season: ${data.season?.name ?? "Unknown"} [${data.season?.status}]`);
        console.log(`\nSpaces (${data.spaces.length}):`);
        for (const s of data.spaces) console.log(`  ${s.name} (${s.type})`);
        const spaceMap = new Map(data.spaces.map(s => [s.id, s.name]));
        console.log(`\nPlantings (${data.plantings.length}):`);
        for (const p of data.plantings) {
          const spaceName = p.space_id ? spaceMap.get(p.space_id) ?? p.space_id : "";
          console.log(`  ${p.crop}${p.variety ? ` - ${p.variety}` : ""} [${p.stage}]${spaceName ? ` in ${spaceName}` : ""}`);
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
        if (plan.overdue.length === 0 && plan.thisWeek.length === 0 && plan.noDue.length === 0 && plan.suggestions.length === 0) {
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
      const config = readConfig();
      let spaceId: string | undefined;
      if (opts.space) {
        const db = getDb();
        const space = repo.getSpaceByName(db, config.defaultSeasonId, opts.space);
        if (!space) throw new TendError("NOT_FOUND", `Space '${opts.space}' not found`);
        spaceId = space.id;
      }
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
      let spaceId: string | undefined;
      if (opts.space) {
        const db = getDb();
        const space = repo.getSpaceByName(db, config.defaultSeasonId, opts.space);
        if (!space) throw new TendError("NOT_FOUND", `Space '${opts.space}' not found`);
        spaceId = space.id;
      }
      const plantings = garden.listPlantings(config.defaultSeasonId, { spaceId, stage: opts.stage, crop: opts.crop });
      if (opts.json) {
        output(plantings, true);
      } else {
        if (plantings.length === 0) { console.log("No plantings found."); return; }
        for (const p of plantings) {
          console.log(`  ${p.id} | ${p.crop}${p.variety ? ` - ${p.variety}` : ""} [${p.stage}] [${p.health}]${p.space_id ? ` in ${p.space_id}` : ""}`);
        }
      }
    } catch (e) { handleError(e, opts.json); }
  });

plantingsCmd
  .command("update-stage <plantingId> <stage>")
  .description("Update a planting's stage")
  .option("--date <date>", "Date of stage change")
  .action((plantingId, stage, opts) => {
    try {
      const planting = garden.updatePlantingStage(plantingId, stage, opts.date);
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
      const config = readConfig();
      let spaceId: string | undefined;
      if (opts.space) {
        const db = getDb();
        const space = repo.getSpaceByName(db, config.defaultSeasonId, opts.space);
        if (!space) throw new TendError("NOT_FOUND", `Space '${opts.space}' not found`);
        spaceId = space.id;
      }
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
  .description("List tasks")
  .option("--status <status>", "Filter by status")
  .option("--space <name>", "Filter by space name")
  .option("--due-before <date>", "Filter by due date")
  .option("--json", "Output as JSON", false)
  .action((opts) => {
    try {
      const config = readConfig();
      let spaceId: string | undefined;
      if (opts.space) {
        const db = getDb();
        const space = repo.getSpaceByName(db, config.defaultSeasonId, opts.space);
        if (!space) throw new TendError("NOT_FOUND", `Space '${opts.space}' not found`);
        spaceId = space.id;
      }
      const tasks = garden.listTasks(config.defaultSeasonId, { status: opts.status, spaceId, dueBefore: opts.dueBefore });
      if (opts.json) {
        output(tasks, true);
      } else {
        if (tasks.length === 0) { console.log("No tasks found."); return; }
        for (const t of tasks) {
          const status = t.status === "done" ? "✓" : "○";
          console.log(`  ${status} ${t.id} | [${t.priority}] ${t.title}${t.due_at ? ` (due ${t.due_at})` : ""} [${t.status}]`);
        }
      }
    } catch (e) { handleError(e, opts.json); }
  });

tasksCmd
  .command("done <taskId>")
  .description("Mark a task as done")
  .action((taskId) => {
    try {
      const task = garden.completeTask(taskId);
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
      let spaceId: string | undefined;
      if (opts.space) {
        const db = getDb();
        const space = repo.getSpaceByName(db, config.defaultSeasonId, opts.space);
        if (!space) throw new TendError("NOT_FOUND", `Space '${opts.space}' not found`);
        spaceId = space.id;
      }
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
  .option("--note <text>", "Note / summary")
  .option("--data <json>", "Additional JSON data")
  .option("--date <date>", "Date (YYYY-MM-DD)")
  .action((opts) => {
    try {
      const config = readConfig();
      let spaceId: string | undefined;
      if (opts.space) {
        const db = getDb();
        const space = repo.getSpaceByName(db, config.defaultSeasonId, opts.space);
        if (!space) throw new TendError("NOT_FOUND", `Space '${opts.space}' not found`);
        spaceId = space.id;
      }
      const event = garden.logEvent({
        seasonId: config.defaultSeasonId,
        spaceId,
        plantingId: opts.planting,
        type: opts.type,
        happenedAt: opts.date,
        summary: opts.note ?? "",
        dataJson: opts.data,
      });
      console.log(`Logged: [${event.type}] ${event.summary} (${event.id})`);
    } catch (e) { handleError(e, false); }
  });

program.parse();
