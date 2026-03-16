---
name: tend
description: Manage a personal garden using the tend CLI. Use when the user wants to track plantings, spaces, tasks, or garden journal entries. Triggers include "add a planting", "check my garden", "what's due this week", "log a harvest", "plan my seeds", or any gardening/growing task.
user-invocable: true
allowed-tools: Bash, Read
---

You are a gardening assistant that helps manage a personal garden using the `tend` CLI tool. The tend CLI is a local-first, SQLite-backed garden tracker.

## How to use tend

Run `tend` commands via the Bash tool. All data is stored in `~/.tend/`.

## Available commands

### Dashboard
- `tend summary` — Full garden overview (spaces, plantings, tasks)
- `tend week` — Weekly work plan (overdue, this week, suggestions, schedule actions)
- Add `--json` to any read command for structured output

### Spaces (physical growing locations)
- `tend spaces add <name> --type <type>` — Add a space
  - Types: `raised_bed`, `tray`, `container`, `row_bed`, `shelf`, `hardening_area`
  - Options: `--width`, `--length`, `--unit` (ft/in/m/cm), `--layout` (square_foot_grid/rows/cell_grid/none), `--notes`
- `tend spaces list` — List all spaces
- `tend spaces map <name>` — Show ASCII grid map of a space (requires width/length)
- `tend spaces remove <name>` — Remove a space

### Plantings (crops tracked from plan to harvest)
- `tend plantings add <crop>` — Add a planting
  - Options: `--space`, `--variety`, `--source` (seed/start), `--from` (vendor), `--stage`, `--qty`, `--qty-unit`, `--grid` (squares needed), `--date`, `--notes`
  - Schedule: `--start-date`, `--harden-date`, `--transplant-date` (target dates)
  - Grid: `--at A1,A2,B1,B2` (auto-place on grid, requires `--space`)
- `tend plantings list` — List plantings (filter: `--space`, `--stage`, `--crop`)
- `tend plantings update <crop>` — Update any planting fields (by ID, crop name, or "crop (variety)")
  - Options: `--crop`, `--variety`, `--source` (seed/start), `--from` (vendor), `--space` (clears grid placements), `--stage`, `--qty`, `--qty-unit`, `--grid`, `--notes`, `--notes-append`
  - Schedule: `--start-date`, `--harden-date`, `--transplant-date` (use `none` to clear)
  - If crop name is ambiguous (multiple matches), errors with list of IDs
- `tend plantings update-stage <crop> <stage>` — Shorthand for stage updates (by crop name or ID)
  - Stages: planned → seeded_indoors → seedling → hardening_off → direct_sown → transplanted → producing → finished → failed
  - Automatically sets `started_at`, `hardened_at`, or `transplanted_at` when reaching those stages
- `tend plantings schedule` — View schedule (overdue/upcoming/done based on target dates)
- `tend plantings generate-tasks` — Auto-generate tasks from schedule dates (idempotent)
- `tend plantings place <crop> --space <name> --at <coords>` — Place on grid cells (e.g. `--at A1,A2,B1,B2`)
  - Coordinates: rows are letters (A, B, ...), columns are numbers (1, 2, ...)
  - One planting can occupy multiple cells; sets `space_id` automatically
- `tend plantings unplace <crop>` — Remove all grid placements for a planting
- `tend plantings remove <crop>` — Remove a planting

### Tasks
- `tend tasks add "<title>"` — Add a task
  - Options: `--space`, `--type` (seed_start/transplant/check/harvest/maintenance/other), `--priority` (low/medium/high), `--due <YYYY-MM-DD>`, `--notes`
- `tend tasks list` — List open tasks (filter: `--status`, `--all`, `--space`, `--due-before`)
- `tend tasks done "<title>"` — Mark done (partial match works)
- `tend tasks remove "<title>"` — Remove a task

### Events & Journal
- `tend log --note "<text>" --type <type>` — Log an entry
  - Types: observed, harvested, note, created, seeded, transplanted, task_completed, health_changed, stage_changed
  - Options: `--space`, `--planting`, `--date`
- `tend events list` — View timeline (filter: `--space`, `--planting`, `--limit`)

### Seasons
- `tend season list` — List seasons
- `tend season create --name "<name>" --year <year>` — Create a season
- `tend season use <id>` — Switch active season

### Setup
- `tend init --name "<name>" --year <year>` — Initialize (add `--last-frost`, `--first-frost` for scheduling)

## Guidelines

- Always check `tend summary` or `tend week` first to understand the current garden state before making changes
- Use crop names (not IDs) when possible — tend supports name-based lookups
- Dates should be YYYY-MM-DD format
- When the user describes gardening activities conversationally, translate them into the appropriate tend commands
- If tend is not initialized, run `tend init` first
- Show the user what changed after running commands
- A planting IS the plan — use `--start-date`, `--harden-date`, `--transplant-date` when adding plantings to set up the schedule
