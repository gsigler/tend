#!/usr/bin/env bun
import { Command } from "commander";
import { initCommand } from "./commands/init";
import { installSkills } from "./commands/install-skills";
import { seasonCreate, seasonUse, seasonList } from "./commands/season";
import { readConfig, getDb } from "./db/connection";
import * as garden from "./services/garden";
import * as repo from "./db/repo";
import { handleError, output } from "./commands/output";
import { TendError } from "./services/errors";
import {
  validateSpaceType, validateLayoutMode, validateSourceType, validateStage,
  validateTaskType, validatePriority, validateEventType, validateSun,
} from "./commands/validate";
import { humanize, relativeDate, shortDate, pad, cropName, header, priorityIcon } from "./commands/format";
import { parseCoords, validateCoords, formatCoord, buildGridData, renderAsciiMap, buildMapJson } from "./commands/grid";

const program = new Command();

program
  .name("tend")
  .description("Local-first CLI for tracking and managing a personal garden")
  .version("0.2.0");

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

// --- install-skills ---
program
  .command("install-skills")
  .description("Install Claude Code skill for tend")
  .action(() => {
    try { installSkills(); } catch (e) { handleError(e, false); }
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
        console.log(header(`${data.garden?.name ?? "Garden"} — ${data.season?.name ?? "Season"}`));
        const frost = [
          data.season?.last_frost_date ? `Last frost: ${shortDate(data.season.last_frost_date)}` : null,
          data.season?.first_frost_date ? `First frost: ${shortDate(data.season.first_frost_date)}` : null,
        ].filter(Boolean).join("  •  ");
        if (frost) console.log(frost);

        if (data.spaces.length > 0) {
          console.log(header("Spaces"));
          for (const s of data.spaces) {
            const dims = s.width && s.length ? ` ${s.width}×${s.length}${s.unit ?? ""}` : "";
            const layout = s.layout_mode !== "none" ? ` (${humanize(s.layout_mode)})` : "";
            console.log(`  ${pad(s.name, 20)} ${humanize(s.type)}${dims}${layout}`);
          }
        }

        if (data.plantings.length > 0) {
          console.log(header("Plantings"));
          for (const p of data.plantings) {
            const spaceName = p.space_id ? spaceMap.get(p.space_id) : null;
            const where = spaceName ? `  → ${spaceName}` : "";
            const sched = p.target_start_date ? `  start ${relativeDate(p.target_start_date)}` : "";
            console.log(`  ${pad(cropName(p.crop, p.variety), 28)} ${pad(humanize(p.stage), 16)} ${humanize(p.health)}${where}${sched}`);
          }
        }

        if (data.catalogCount > 0) {
          const revInfo = data.reviewCount > 0 ? ` (${data.reviewCount} reviewed this season)` : "";
          console.log(`\nCatalog: ${data.catalogCount} varieties${revInfo}`);
        }

        console.log(header(`Open Tasks (${data.openTasks.length})`));
        if (data.openTasks.length === 0) {
          console.log("  All clear!");
        } else {
          for (const t of data.openTasks) {
            const due = t.due_at ? relativeDate(t.due_at) : "";
            console.log(`  ${priorityIcon(t.priority)} ${pad(t.title, 40)} ${due}`);
          }
        }
        console.log("");
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
        console.log(header("Weekly Plan"));
        let empty = true;

        if (plan.overdue.length > 0) {
          empty = false;
          console.log("\n  OVERDUE");
          for (const t of plan.overdue) {
            console.log(`  ${priorityIcon(t.priority)} ${pad(t.title, 40)} ${relativeDate(t.due_at!)}`);
          }
        }
        if (plan.thisWeek.length > 0) {
          empty = false;
          console.log("\n  THIS WEEK");
          for (const t of plan.thisWeek) {
            console.log(`  ${priorityIcon(t.priority)} ${pad(t.title, 40)} ${relativeDate(t.due_at!)}`);
          }
        }
        if (plan.noDue.length > 0) {
          empty = false;
          console.log("\n  NO DUE DATE");
          for (const t of plan.noDue) {
            console.log(`  ${priorityIcon(t.priority)} ${t.title}`);
          }
        }
        if (plan.suggestions.length > 0) {
          empty = false;
          console.log("\n  SUGGESTED CHECKS");
          for (const s of plan.suggestions) console.log(`   →  ${s}`);
        }
        // Deduplicate schedule actions that already have tasks
        const taskTitles = new Set([...plan.overdue, ...plan.thisWeek].map(t => t.title));
        const uniqueActions = plan.scheduleActions.filter(a => {
          const verb = a.action.replace("OVERDUE: ", "").replace("Start seeds", a.planting.source_type === "seed" ? "Start indoors" : "Direct sow");
          const expectedTitle = `${verb}: ${a.planting.crop}${a.planting.variety ? ` (${a.planting.variety})` : ""}`;
          return !taskTitles.has(expectedTitle);
        });
        if (uniqueActions.length > 0) {
          empty = false;
          console.log("\n  SCHEDULE");
          for (const a of uniqueActions) {
            const name = cropName(a.planting.crop, a.planting.variety);
            const qty = a.planting.quantity ? ` ×${a.planting.quantity}` : "";
            console.log(`   →  ${a.action}: ${name}${qty}  ${relativeDate(a.targetDate)}`);
          }
        }
        if (empty) {
          console.log("\n  Nothing to do this week!");
        }
        console.log("");
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
      console.log(`Added space: ${space.name} (${humanize(space.type)})`);
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
          const dims = s.width && s.length ? `  ${s.width}×${s.length}${s.unit ?? ""}` : "";
          const layout = s.layout_mode !== "none" ? `  (${humanize(s.layout_mode)})` : "";
          const notes = s.notes ? `  — ${s.notes}` : "";
          console.log(`  ${pad(s.name, 20)} ${humanize(s.type)}${dims}${layout}${notes}`);
        }
      }
    } catch (e) { handleError(e, opts.json); }
  });

spacesCmd
  .command("map <name>")
  .description("Show grid map of a space")
  .option("--json", "Output as JSON", false)
  .action((name, opts) => {
    try {
      const config = readConfig();
      const { space, placements } = garden.getSpaceMap(config.defaultSeasonId, name);
      const gridData = buildGridData(space, placements);
      if (opts.json) {
        output(buildMapJson(gridData), true);
      } else {
        console.log(renderAsciiMap(gridData));
      }
    } catch (e) { handleError(e, opts.json); }
  });

// --- plantings ---
const plantingsCmd = program.command("plantings").description("Manage plantings");

plantingsCmd
  .command("add <crop>")
  .description("Add a planting")
  .option("--catalog <entry>", "Link to catalog entry (crop name, 'crop (variety)', or ID)")
  .option("--space <name>", "Space name")
  .option("--variety <variety>", "Variety")
  .option("--source <type>", "Source type (seed, start)", "seed")
  .option("--from <vendor>", "Seed vendor/source (e.g. Burpee, Johnny's)")
  .option("--stage <stage>", "Stage", "planned")
  .option("--qty <n>", "Quantity")
  .option("--qty-unit <unit>", "Quantity unit")
  .option("--grid <n>", "Grid squares needed")
  .option("--date <date>", "Start date")
  .option("--start-date <date>", "Target start date (YYYY-MM-DD)")
  .option("--harden-date <date>", "Target hardening date (YYYY-MM-DD)")
  .option("--transplant-date <date>", "Target transplant date (YYYY-MM-DD)")
  .option("--at <coords>", "Grid coordinates to place (e.g. A1,A2,B1,B2)")
  .option("--notes <text>", "Notes")
  .action((crop, opts) => {
    try {
      validateSourceType(opts.source);
      validateStage(opts.stage);
      const config = readConfig();
      const spaceId = resolveSpaceId(opts.space);
      const db = getDb();

      let catalogId: string | undefined;
      let resolvedCrop = crop;
      let resolvedVariety = opts.variety;
      let resolvedSource = opts.source;
      let resolvedVendor = opts.from;

      if (opts.catalog) {
        // Link to existing catalog entry
        const entry = garden.findCatalogStrict(opts.catalog);
        catalogId = entry.id;
        resolvedCrop = entry.crop;
        resolvedVariety = entry.variety;
        resolvedSource = entry.source_type ?? opts.source;
        resolvedVendor = entry.vendor ?? opts.from;
      } else if (opts.variety) {
        // Auto-create or link catalog entry when variety is provided
        const existing = repo.findCatalogEntry(db, crop, opts.variety);
        if (existing) {
          catalogId = existing.id;
        } else {
          const entry = repo.createCatalogEntry(db, {
            crop,
            variety: opts.variety,
            vendor: opts.from,
            sourceType: opts.source,
            gridSquares: opts.grid ? parseInt(opts.grid) : undefined,
          });
          catalogId = entry.id;
          console.log(`Created catalog entry: ${cropName(entry.crop, entry.variety)}`);
        }
      }

      const planting = garden.addPlanting({
        seasonId: config.defaultSeasonId,
        catalogId,
        spaceId,
        crop: resolvedCrop,
        variety: resolvedVariety,
        sourceType: resolvedSource,
        source: resolvedVendor,
        stage: opts.stage,
        quantity: opts.qty ? parseFloat(opts.qty) : undefined,
        quantityUnit: opts.qtyUnit,
        gridSquares: opts.grid ? parseInt(opts.grid) : undefined,
        startedAt: opts.date,
        targetStartDate: opts.startDate,
        targetHardenDate: opts.hardenDate,
        targetTransplantDate: opts.transplantDate,
        notes: opts.notes,
      });
      console.log(`Added: ${cropName(planting.crop, planting.variety)} [${humanize(planting.stage)}]`);
      if (planting.target_start_date) console.log(`  Start:      ${relativeDate(planting.target_start_date)}`);
      if (planting.target_harden_date) console.log(`  Harden:     ${relativeDate(planting.target_harden_date)}`);
      if (planting.target_transplant_date) console.log(`  Transplant: ${relativeDate(planting.target_transplant_date)}`);

      // Auto-place on grid if --at provided
      if (opts.at && opts.space) {
        const cells = parseCoords(opts.at);
        const space = repo.getSpaceByName(db, config.defaultSeasonId, opts.space);
        if (space) {
          validateCoords(space, cells);
          garden.placePlanting(config.defaultSeasonId, planting.id, opts.space, cells);
          const coordStr = cells.map(c => formatCoord(c.row, c.col)).join(", ");
          console.log(`  Placed at ${coordStr} in ${opts.space}`);
        }
      }
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
        for (let i = 0; i < plantings.length; i++) {
          const p = plantings[i];
          const spaceName = p.space_id ? spaceMap.get(p.space_id) : null;
          const where = spaceName ? `  → ${spaceName}` : "";
          const date = p.started_at ? `  (${shortDate(p.started_at)})` : "";
          console.log(`  ${pad(`#${i + 1}`, 4)} ${pad(cropName(p.crop, p.variety), 28)} ${pad(humanize(p.stage), 16)} ${humanize(p.health)}${where}${date}`);
        }
      }
    } catch (e) { handleError(e, opts.json); }
  });

plantingsCmd
  .command("update <plantingIdOrCrop>")
  .description("Update planting fields")
  .option("--crop <name>", "Rename the crop")
  .option("--variety <variety>", "Update variety")
  .option("--source <type>", "Source type (seed, start)")
  .option("--from <vendor>", "Seed vendor")
  .option("--space <name>", "Move to a different space")
  .option("--stage <stage>", "Update stage")
  .option("--date <date>", "Date for stage change")
  .option("--qty <n>", "Update quantity")
  .option("--qty-unit <unit>", "Update quantity unit")
  .option("--grid <n>", "Update grid squares needed")
  .option("--start-date <date>", "Target start date (or 'none' to clear)")
  .option("--harden-date <date>", "Target hardening date (or 'none' to clear)")
  .option("--transplant-date <date>", "Target transplant date (or 'none' to clear)")
  .option("--notes <text>", "Replace notes")
  .option("--notes-append <text>", "Append to notes")
  .action((plantingIdOrCrop, opts) => {
    try {
      const input: any = {};
      let hasUpdate = false;

      if (opts.crop) { input.crop = opts.crop; hasUpdate = true; }
      if (opts.variety) { input.variety = opts.variety; hasUpdate = true; }
      if (opts.source) { validateSourceType(opts.source); input.sourceType = opts.source; hasUpdate = true; }
      if (opts.from) { input.source = opts.from; hasUpdate = true; }
      if (opts.space) {
        const spaceId = resolveSpaceId(opts.space);
        input.spaceId = spaceId ?? null;
        hasUpdate = true;
      }
      if (opts.stage) {
        validateStage(opts.stage);
        input.stage = opts.stage;
        hasUpdate = true;
      }
      if (opts.qty) { input.quantity = parseFloat(opts.qty); hasUpdate = true; }
      if (opts.qtyUnit) { input.quantityUnit = opts.qtyUnit; hasUpdate = true; }
      if (opts.grid) { input.gridSquares = parseInt(opts.grid); hasUpdate = true; }
      if (opts.startDate) { input.targetStartDate = opts.startDate === "none" ? null : opts.startDate; hasUpdate = true; }
      if (opts.hardenDate) { input.targetHardenDate = opts.hardenDate === "none" ? null : opts.hardenDate; hasUpdate = true; }
      if (opts.transplantDate) { input.targetTransplantDate = opts.transplantDate === "none" ? null : opts.transplantDate; hasUpdate = true; }
      if (opts.notes) { input.notes = opts.notes; hasUpdate = true; }
      if (opts.notesAppend) { input.notesAppend = opts.notesAppend; hasUpdate = true; }

      if (!hasUpdate) throw new TendError("INVALID_INPUT", "Nothing to update. Provide at least one option.");

      const planting = garden.updatePlanting(plantingIdOrCrop, input);
      const spaceMap = buildSpaceMap();
      const spaceName = planting!.space_id ? spaceMap.get(planting!.space_id) : null;
      console.log(`Updated: ${cropName(planting!.crop, planting!.variety)}`);
      if (opts.stage) console.log(`  stage: ${humanize(planting!.stage)}`);
      if (opts.variety) console.log(`  variety: ${planting!.variety}`);
      if (opts.from) console.log(`  source: ${planting!.source}`);
      if (opts.notes || opts.notesAppend) console.log(`  notes: "${planting!.notes}"`);
      if (opts.startDate) console.log(`  start date: ${planting!.target_start_date ?? "cleared"}`);
      if (opts.hardenDate) console.log(`  harden date: ${planting!.target_harden_date ?? "cleared"}`);
      if (opts.transplantDate) console.log(`  transplant date: ${planting!.target_transplant_date ?? "cleared"}`);
      if (spaceName) console.log(`  → ${spaceName}`);
    } catch (e) { handleError(e, false); }
  });

plantingsCmd
  .command("update-stage <plantingIdOrCrop> <stage>")
  .description("Update a planting's stage (by ID or crop name)")
  .option("--date <date>", "Date of stage change")
  .action((plantingIdOrCrop, stage, opts) => {
    try {
      validateStage(stage);
      const planting = garden.updatePlantingStage(plantingIdOrCrop, stage, opts.date);
      console.log(`Updated: ${cropName(planting!.crop, planting!.variety)} → ${humanize(stage)}`);
    } catch (e) { handleError(e, false); }
  });

plantingsCmd
  .command("remove <plantingIdOrCrop>")
  .description("Remove a planting (by ID or crop name)")
  .action((plantingIdOrCrop) => {
    try {
      const planting = garden.removePlanting(plantingIdOrCrop);
      console.log(`Removed: ${cropName(planting.crop, planting.variety)}`);
    } catch (e) { handleError(e, false); }
  });

plantingsCmd
  .command("place <crop>")
  .description("Place a planting on grid cells")
  .requiredOption("--space <name>", "Space name")
  .requiredOption("--at <coords>", "Coordinates (e.g. A1,A2,B1,B2)")
  .action((crop, opts) => {
    try {
      const config = readConfig();
      const cells = parseCoords(opts.at);
      const db = getDb();
      const space = repo.getSpaceByName(db, config.defaultSeasonId, opts.space);
      if (!space) throw new TendError("NOT_FOUND", `Space '${opts.space}' not found`);
      validateCoords(space, cells);
      const result = garden.placePlanting(config.defaultSeasonId, crop, opts.space, cells);
      const coordStr = cells.map(c => formatCoord(c.row, c.col)).join(", ");
      console.log(`Placed: ${cropName(result.planting.crop, result.planting.variety)} at ${coordStr} in ${opts.space}`);
    } catch (e) { handleError(e, false); }
  });

plantingsCmd
  .command("unplace <crop>")
  .description("Remove all grid placements for a planting")
  .action((crop) => {
    try {
      const config = readConfig();
      const result = garden.unplacePlanting(config.defaultSeasonId, crop);
      console.log(`Removed ${cropName(result.planting.crop, result.planting.variety)} from grid (${result.removedCount} cell(s))`);
    } catch (e) { handleError(e, false); }
  });

plantingsCmd
  .command("schedule")
  .description("Show planting schedule with next actions")
  .option("--json", "Output as JSON", false)
  .action((opts) => {
    try {
      const config = readConfig();
      const schedule = garden.getPlantingSchedule(config.defaultSeasonId);
      if (opts.json) {
        output(schedule, true);
      } else {
        console.log(header("Planting Schedule"));
        if (schedule.overdue.length > 0) {
          console.log("\n  OVERDUE");
          for (const p of schedule.overdue) {
            const qty = p.quantity ? ` ×${p.quantity}` : "";
            console.log(`  !!  ${pad(p.next_action, 22)} ${pad(cropName(p.crop, p.variety), 28)}${qty}  ${relativeDate(p.next_date)}`);
          }
        }
        if (schedule.upcoming.length > 0) {
          console.log("\n  UPCOMING");
          for (const p of schedule.upcoming) {
            const qty = p.quantity ? ` ×${p.quantity}` : "";
            const date = p.next_date ? relativeDate(p.next_date) : "no date set";
            console.log(`      ${pad(p.next_action, 22)} ${pad(cropName(p.crop, p.variety), 28)}${qty}  ${date}`);
          }
        }
        if (schedule.done.length > 0) {
          console.log(`\n  DONE (${schedule.done.length})`);
          for (const p of schedule.done) {
            console.log(`   ✓  ${cropName(p.crop, p.variety)} [${humanize(p.stage)}]`);
          }
        }
        if (schedule.overdue.length === 0 && schedule.upcoming.length === 0 && schedule.done.length === 0) {
          console.log("\n  No scheduled plantings. Add one with: tend plantings add <crop> --start-date <date>");
        }
        console.log("");
      }
    } catch (e) { handleError(e, opts.json); }
  });

plantingsCmd
  .command("generate-tasks")
  .description("Auto-generate tasks from planting schedule dates")
  .action(() => {
    try {
      const config = readConfig();
      const created = garden.generateTasksFromSchedule(config.defaultSeasonId);
      if (created.length === 0) {
        console.log("No new tasks to generate.");
      } else {
        console.log(`Generated ${created.length} task(s):`);
        for (const t of created) {
          console.log(`  ${priorityIcon(t.priority)} ${t.title}  ${t.due_at ? relativeDate(t.due_at) : ""}`);
        }
      }
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
      console.log(`Added: ${task.title}${task.due_at ? ` (due ${relativeDate(task.due_at)})` : ""}`);
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
        const spaceMap = buildSpaceMap();
        for (let i = 0; i < tasks.length; i++) {
          const t = tasks[i];
          const icon = t.status === "done" ? "✓" : t.status === "skipped" ? "–" : "○";
          const spaceName = t.space_id ? spaceMap.get(t.space_id) : null;
          const where = spaceName ? `  [${spaceName}]` : "";
          const due = t.due_at ? `  ${relativeDate(t.due_at)}` : "";
          console.log(`  ${icon} ${pad(`#${i + 1}`, 4)} ${priorityIcon(t.priority)} ${pad(t.title, 40)}${due}${where}`);
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
      console.log(`✓ ${task!.title}`);
    } catch (e) { handleError(e, false); }
  });

tasksCmd
  .command("remove <taskIdOrTitle>")
  .description("Remove a task (by ID or title search)")
  .action((taskIdOrTitle) => {
    try {
      const task = garden.removeTask(taskIdOrTitle);
      console.log(`Removed: ${task.title}`);
    } catch (e) { handleError(e, false); }
  });

// --- events ---
const eventsCmd = program.command("events").description("View garden timeline");

eventsCmd
  .command("list")
  .description("List events")
  .option("--planting <id>", "Filter by planting ID or crop name")
  .option("--space <name>", "Filter by space name")
  .option("--limit <n>", "Limit results", "50")
  .option("--json", "Output as JSON", false)
  .action((opts) => {
    try {
      const config = readConfig();
      const spaceId = resolveSpaceId(opts.space);

      // Support planting lookup by crop name
      let plantingId = opts.planting;
      if (plantingId && !plantingId.startsWith("planting_")) {
        const db = getDb();
        const found = repo.findPlanting(db, config.defaultSeasonId, plantingId);
        if (found) plantingId = found.id;
      }

      const events = garden.listEvents(config.defaultSeasonId, {
        plantingId,
        spaceId,
        limit: parseInt(opts.limit),
      });
      if (opts.json) {
        output(events, true);
      } else {
        if (events.length === 0) { console.log("No events found."); return; }
        for (const e of events) {
          const date = shortDate(e.happened_at.split("T")[0]);
          console.log(`  ${pad(date, 8)} ${pad(humanize(e.type), 18)} ${e.summary}`);
        }
      }
    } catch (e) { handleError(e, opts.json); }
  });

// --- log ---
program
  .command("log")
  .description("Add a journal entry / event")
  .option("--space <name>", "Space name")
  .option("--planting <id>", "Planting ID or crop name")
  .option("--type <type>", "Event type (observed, harvested, note, etc.)", "note")
  .requiredOption("--note <text>", "Note / summary (required)")
  .option("--data <json>", "Additional JSON data")
  .option("--date <date>", "Date (YYYY-MM-DD)")
  .action((opts) => {
    try {
      validateEventType(opts.type);
      const config = readConfig();
      const spaceId = resolveSpaceId(opts.space);

      // Support planting lookup by crop name
      let plantingId = opts.planting;
      if (plantingId && !plantingId.startsWith("planting_")) {
        const db = getDb();
        const found = repo.findPlanting(db, config.defaultSeasonId, plantingId);
        if (found) plantingId = found.id;
      }

      const event = garden.logEvent({
        seasonId: config.defaultSeasonId,
        spaceId,
        plantingId,
        type: opts.type,
        happenedAt: opts.date,
        summary: opts.note,
        dataJson: opts.data,
      });
      console.log(`Logged: [${humanize(event.type)}] ${event.summary}`);
    } catch (e) { handleError(e, false); }
  });

// --- catalog ---
const catalogCmd = program.command("catalog").description("Manage variety reference library");

catalogCmd
  .command("add <crop>")
  .description("Add a variety to the catalog")
  .requiredOption("--variety <variety>", "Variety name")
  .option("--vendor <vendor>", "Seed vendor/source")
  .option("--url <url>", "Product page URL")
  .option("--source <type>", "Source type (seed, start)")
  .option("--days <n>", "Days to maturity")
  .option("--start-weeks <n>", "Weeks before last frost to start indoors")
  .option("--min-temp <n>", "Min night temp (F) for transplant")
  .option("--spacing <n>", "Spacing in inches")
  .option("--plants-per-square <n>", "Plants per square foot", "1")
  .option("--sun <level>", "Sun requirement (full_sun, part_sun, shade)")
  .option("--habit <type>", "Growth habit (indeterminate, determinate, bush, vine, compact)")
  .option("--grid <n>", "Default grid squares per planting")
  .option("--tags <tags>", "Comma-separated tags")
  .option("--notes <text>", "Growing notes")
  .action((crop, opts) => {
    try {
      if (opts.source) validateSourceType(opts.source);
      if (opts.sun) validateSun(opts.sun);
      const entry = garden.addCatalogEntry({
        crop,
        variety: opts.variety,
        vendor: opts.vendor,
        url: opts.url,
        sourceType: opts.source,
        daysToMaturity: opts.days ? parseInt(opts.days) : undefined,
        startIndoorsWeeks: opts.startWeeks ? parseInt(opts.startWeeks) : undefined,
        minNightTemp: opts.minTemp ? parseInt(opts.minTemp) : undefined,
        spacingInches: opts.spacing ? parseInt(opts.spacing) : undefined,
        plantsPerSquare: opts.plantsPerSquare ? parseInt(opts.plantsPerSquare) : undefined,
        sun: opts.sun,
        growthHabit: opts.habit,
        gridSquares: opts.grid ? parseInt(opts.grid) : undefined,
        tags: opts.tags,
        notes: opts.notes,
      });
      console.log(`Added to catalog: ${cropName(entry.crop, entry.variety)}`);
    } catch (e) { handleError(e, false); }
  });

catalogCmd
  .command("list")
  .description("List catalog entries")
  .option("--crop <crop>", "Filter by crop")
  .option("--tag <tag>", "Filter by tag")
  .option("--vendor <vendor>", "Filter by vendor")
  .option("--json", "Output as JSON", false)
  .action((opts) => {
    try {
      const entries = garden.listCatalog({ crop: opts.crop, tag: opts.tag, vendor: opts.vendor });
      if (opts.json) {
        output(entries, true);
      } else {
        if (entries.length === 0) { console.log("No catalog entries."); return; }
        console.log(header(`Catalog (${entries.length} varieties)`));
        for (const e of entries) {
          const days = e.days_to_maturity ? `${pad(e.days_to_maturity + " days", 10)}` : pad("", 10);
          const vendor = e.vendor ? `  ${pad(e.vendor, 20)}` : pad("", 22);
          const tags = e.tags ? `  ${e.tags}` : "";
          console.log(`  ${pad(cropName(e.crop, e.variety), 38)} ${days}${vendor}${tags}`);
        }
      }
    } catch (e) { handleError(e, opts.json); }
  });

catalogCmd
  .command("show <cropOrId>")
  .description("Show full detail for a catalog entry")
  .option("--json", "Output as JSON", false)
  .action((cropOrId, opts) => {
    try {
      const data = garden.getCatalogShow(cropOrId);
      if (opts.json) {
        output(data, true);
      } else {
        const e = data.entry;
        console.log(header(cropName(e.crop, e.variety)));
        if (e.vendor) console.log(`  Vendor:            ${e.vendor}`);
        if (e.url) console.log(`  URL:               ${e.url}`);
        if (e.source_type) console.log(`  Source:            ${humanize(e.source_type)}`);
        if (e.days_to_maturity) console.log(`  Days to maturity:  ${e.days_to_maturity}`);
        if (e.start_indoors_weeks) console.log(`  Start indoors:     ${e.start_indoors_weeks} weeks before last frost`);
        if (e.min_night_temp) console.log(`  Min night temp:    ${e.min_night_temp}°F`);
        if (e.spacing_inches) console.log(`  Spacing:           ${e.spacing_inches}"`);
        if (e.plants_per_square && e.plants_per_square !== 1) console.log(`  Plants per sq ft:  ${e.plants_per_square}`);
        if (e.sun) console.log(`  Sun:               ${humanize(e.sun)}`);
        if (e.growth_habit) console.log(`  Growth habit:      ${e.growth_habit}`);
        if (e.grid_squares) console.log(`  Default grid:      ${e.grid_squares} square(s)`);
        if (e.tags) console.log(`  Tags:              ${e.tags}`);
        if (e.notes) console.log(`\n  Notes:\n    ${e.notes}`);

        if (data.plantings.length > 0) {
          console.log(header("Season History"));
          for (const p of data.plantings) {
            const gridInfo = p.grid_count ? `${p.grid_count} squares` : "";
            const review = data.reviews.find((r: any) => r.season_id === p.season_id);
            const rating = review?.rating ? "★".repeat(review.rating) + "☆".repeat(5 - review.rating) : "(no review)";
            const spaceName = p.space_name ?? "";
            console.log(`  ${p.year}  ${pad(spaceName, 16)} ${pad(gridInfo, 12)} ${pad(humanize(p.stage), 14)} ${rating}`);
            if (review?.review) console.log(`        "${review.review}"`);
          }
        }
      }
    } catch (e) { handleError(e, opts.json); }
  });

catalogCmd
  .command("update <cropOrId>")
  .description("Update catalog entry fields")
  .option("--crop <name>", "Rename the crop")
  .option("--variety <variety>", "Update variety")
  .option("--vendor <vendor>", "Update vendor")
  .option("--url <url>", "Update URL")
  .option("--source <type>", "Update source type (seed, start)")
  .option("--days <n>", "Update days to maturity")
  .option("--start-weeks <n>", "Update start indoors weeks")
  .option("--min-temp <n>", "Update min night temp")
  .option("--spacing <n>", "Update spacing")
  .option("--plants-per-square <n>", "Update plants per square foot")
  .option("--sun <level>", "Update sun requirement")
  .option("--habit <type>", "Update growth habit")
  .option("--grid <n>", "Update default grid squares")
  .option("--tags <tags>", "Update tags (replaces)")
  .option("--notes <text>", "Update notes (replaces)")
  .option("--notes-append <text>", "Append to notes")
  .action((cropOrId, opts) => {
    try {
      const input: any = {};
      let hasUpdate = false;
      if (opts.crop) { input.crop = opts.crop; hasUpdate = true; }
      if (opts.variety) { input.variety = opts.variety; hasUpdate = true; }
      if (opts.vendor) { input.vendor = opts.vendor; hasUpdate = true; }
      if (opts.url) { input.url = opts.url; hasUpdate = true; }
      if (opts.source) { validateSourceType(opts.source); input.sourceType = opts.source; hasUpdate = true; }
      if (opts.days) { input.daysToMaturity = parseInt(opts.days); hasUpdate = true; }
      if (opts.startWeeks) { input.startIndoorsWeeks = parseInt(opts.startWeeks); hasUpdate = true; }
      if (opts.minTemp) { input.minNightTemp = parseInt(opts.minTemp); hasUpdate = true; }
      if (opts.spacing) { input.spacingInches = parseInt(opts.spacing); hasUpdate = true; }
      if (opts.plantsPerSquare) { input.plantsPerSquare = parseInt(opts.plantsPerSquare); hasUpdate = true; }
      if (opts.sun) { validateSun(opts.sun); input.sun = opts.sun; hasUpdate = true; }
      if (opts.habit) { input.growthHabit = opts.habit; hasUpdate = true; }
      if (opts.grid) { input.gridSquares = parseInt(opts.grid); hasUpdate = true; }
      if (opts.tags) { input.tags = opts.tags; hasUpdate = true; }
      if (opts.notes) { input.notes = opts.notes; hasUpdate = true; }
      if (opts.notesAppend) { input.notesAppend = opts.notesAppend; hasUpdate = true; }
      if (!hasUpdate) throw new TendError("INVALID_INPUT", "Nothing to update. Provide at least one option.");
      const entry = garden.updateCatalogEntry(cropOrId, input);
      console.log(`Updated: ${cropName(entry!.crop, entry!.variety)}`);
    } catch (e) { handleError(e, false); }
  });

catalogCmd
  .command("remove <cropOrId>")
  .description("Remove a catalog entry")
  .option("--force", "Remove catalog entry and all linked plantings", false)
  .action((cropOrId, opts) => {
    try {
      const entry = garden.removeCatalogEntry(cropOrId, opts.force);
      console.log(`Removed from catalog: ${cropName(entry.crop, entry.variety)}`);
    } catch (e) { handleError(e, false); }
  });

catalogCmd
  .command("review <cropOrId>")
  .description("Log an end-of-season review")
  .option("--rating <n>", "Star rating (1-5)")
  .option("--yield <text>", "Yield notes")
  .option("--would-grow-again", "Would grow again", false)
  .option("--no-grow-again", "Would not grow again", false)
  .option("--notes <text>", "Review notes")
  .action((cropOrId, opts) => {
    try {
      const input: any = {};
      if (opts.rating) input.rating = parseInt(opts.rating);
      if (opts.yield) input.yieldNotes = opts.yield;
      if (opts.wouldGrowAgain) input.wouldGrowAgain = true;
      if (opts.noGrowAgain) input.wouldGrowAgain = false;
      if (opts.notes) input.review = opts.notes;
      const { entry, review } = garden.reviewCatalogEntry(cropOrId, input);
      const stars = review.rating ? " " + "★".repeat(review.rating) + "☆".repeat(5 - review.rating) : "";
      console.log(`Reviewed: ${cropName(entry.crop, entry.variety)}${stars}`);
    } catch (e) { handleError(e, false); }
  });

catalogCmd
  .command("import")
  .description("Import current season's plantings into the catalog")
  .option("--dry-run", "Show what would be imported without doing it", false)
  .action((opts) => {
    try {
      const config = readConfig();
      const results = garden.importCatalog(config.defaultSeasonId, opts.dryRun);
      if (results.length === 0) {
        console.log("Nothing to import — all plantings with varieties are already cataloged.");
        return;
      }
      const verb = opts.dryRun ? "Would import" : "Imported";
      console.log(`${verb} ${results.length} planting(s):`);
      const spaceMap = buildSpaceMap();
      for (const r of results) {
        const spaceName = r.planting.space_id ? spaceMap.get(r.planting.space_id) : null;
        const where = spaceName ? `  from ${spaceName}` : "";
        const action = r.created ? "+" : "→";
        console.log(`  ${action} ${cropName(r.planting.crop, r.planting.variety)}${where}`);
      }
      if (opts.dryRun) console.log("\nRun without --dry-run to import.");
    } catch (e) { handleError(e, false); }
  });

program.parse();
