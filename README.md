# tend

Local-first CLI for tracking and managing a personal garden. SQLite-backed, JSON-friendly, designed for a full growing season.

```
$ tend summary

My Garden — Spring 2026
───────────────────────
Last frost: May 1  •  First frost: Oct 15

Spaces
──────
  bed-1                Raised Bed  12×2ft  (Square Foot Grid)
  tray-a               Tray

Plantings
─────────
  peas                             Direct Sown      Healthy  → bed-1
  lettuce (buttercrunch)           Transplanted     Healthy  → bed-1

Open Tasks (1)
──────────────
  !!! Check peas for germination                    Mar 22 (in 7d)
```

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/gsigler/tend/main/install.sh | bash
```

Installs a standalone binary to `~/.local/bin`. No runtime dependencies required.

## Quick Start

```bash
tend init --name "My Garden" --year 2026
```

## Core Concepts

**Garden** — Your top-level garden identity, created once with `tend init`.

**Season** — A growing year. You start with one; create more with `tend season create`. Switch between them with `tend season use`.

**Space** — A physical growing location: raised bed, tray, container, shelf, etc. Spaces have optional dimensions and layout modes.

**Planting** — A crop in a space, tracked through growth stages from `planned` → `seeded_indoors` → `seedling` → `hardening_off` → `transplanted` → `producing` → `finished`.

**Task** — Something to do, with optional due dates, priority levels, and space associations. Defaults to showing only open tasks.

**Event** — An immutable journal entry. Every mutation (planting, stage change, task completion) automatically creates an event, and you can log observations manually.

**Seed Plan** — A seed starting schedule entry with target dates for starting, hardening, and transplanting. Can auto-generate tasks.

## Commands

### Initialize

```bash
tend init --name "My Garden" --year 2026
tend init --name "My Garden" --year 2026 --last-frost 2026-05-01 --first-frost 2026-10-15
tend init --force  # reinitialize (requires --force if already set up)
```

### Spaces

```bash
# Add spaces
tend spaces add bed-1 --type raised_bed --width 12 --length 2 --unit ft
tend spaces add tray-a --type tray
tend spaces add pots --type container --notes "deck pots"

# List and remove
tend spaces list
tend spaces list --json
tend spaces remove bed-1
```

**Space types:** `raised_bed`, `tray`, `container`, `row_bed`, `shelf`, `hardening_area`

**Layout modes:** `square_foot_grid`, `rows`, `cell_grid`, `none`

### Plantings

```bash
# Add plantings
tend plantings add peas --space bed-1 --source seed --stage direct_sown --date 2026-03-15
tend plantings add lettuce --space bed-1 --variety buttercrunch --source start --stage transplanted
tend plantings add tomato --stage seeded_indoors --qty 6 --qty-unit plants

# List (with filters)
tend plantings list
tend plantings list --crop peas
tend plantings list --space bed-1
tend plantings list --stage producing
tend plantings list --json

# Update stage (by ID or crop name)
tend plantings update-stage tomato seedling --date 2026-04-01

# Remove (by ID or crop name)
tend plantings remove tomato
```

**Stages:** `planned` → `seeded_indoors` → `seedling` → `hardening_off` → `direct_sown` → `transplanted` → `producing` → `finished` → `failed`

**Source types:** `seed`, `start`

### Tasks

```bash
# Add tasks
tend tasks add "Check peas" --space bed-1 --type check --priority high --due 2026-03-22
tend tasks add "Weed beds" --type maintenance --priority low

# List (defaults to open tasks only)
tend tasks list
tend tasks list --status done
tend tasks list --all              # include done/skipped
tend tasks list --space bed-1
tend tasks list --due-before 2026-04-01
tend tasks list --json

# Complete (by ID or title search)
tend tasks done "Check peas"       # partial match works
tend tasks done task_abc123        # or use the full ID

# Remove
tend tasks remove "Weed"
```

**Task types:** `seed_start`, `transplant`, `check`, `harvest`, `maintenance`, `other`

**Priorities:** `low`, `medium`, `high`

### Events & Journal

```bash
# Log an observation
tend log --space bed-1 --type observed --note "soil looks dry" --date 2026-03-16

# Log a harvest
tend log --planting peas --type harvested --note "first harvest, about 2 cups"

# Log a general note
tend log --type note --note "started composting"

# View timeline
tend events list
tend events list --space bed-1
tend events list --planting peas
tend events list --limit 10
tend events list --json
```

**Event types:** `created`, `seeded`, `transplanted`, `observed`, `harvested`, `task_completed`, `health_changed`, `stage_changed`, `note`

### Seed Starting Plan

Plan your entire seed starting schedule with target dates, then auto-generate tasks.

```bash
# Add plans
tend plan add tomato --variety "San Marzano" --source Burpee --qty 12 --grid 4 \
  --space bed-1 --start-date 2026-03-01 --harden-date 2026-04-15 --transplant-date 2026-05-01

tend plan add peas --start-type direct_sow --qty 30 --start-date 2026-03-20

# List all plans (detailed view with dates and progress)
tend plan list
tend plan list --json

# View schedule (grouped by overdue/upcoming/done)
tend plan schedule
tend plan schedule --json

# Update status as you progress (by ID or crop name)
tend plan update tomato started --date 2026-03-01
tend plan update tomato hardening --date 2026-04-15
tend plan update tomato transplanted --date 2026-05-01

# Auto-generate tasks from plan dates (idempotent — won't duplicate)
tend plan generate-tasks

# Remove a plan
tend plan remove tomato
```

**Start types:** `indoor`, `direct_sow`

**Plan statuses:** `planned` → `started` → `hardening` → `transplanted` / `direct_sown` → `done` / `skipped`

### Seasons

```bash
tend season list
tend season create --name "Fall 2026" --year 2026
tend season use <season-id>
```

### Dashboard Views

```bash
# Full garden overview
tend summary
tend summary --json

# Weekly work plan (overdue tasks, this week's tasks, suggestions, seed plan actions)
tend week
tend week --json
```

The `week` command intelligently surfaces:
- **Overdue tasks** — past their due date
- **This week's tasks** — due in the next 7 days
- **Suggested checks** — seedlings, hardening plants, or producing crops with no events in 7+ days
- **Seed plan actions** — starts, hardening, and transplants due soon

## JSON Output

Every read command supports `--json` for structured output, making it easy to pipe into other tools:

```bash
tend summary --json | jq '.plantings[] | .crop'
tend tasks list --json | jq '[.[] | select(.priority == "high")]'
tend plan schedule --json | jq '.overdue'
```

## Name-Based Lookups

Most commands accept either an ID or a name. You don't need to copy-paste IDs:

```bash
# These all work:
tend plantings update-stage tomato seedling       # by crop name
tend plantings update-stage planting_abc123 seedling  # by ID

tend tasks done "Water"                           # partial title match
tend tasks done task_abc123                       # by ID

tend plan update basil started                    # by crop name
```

## Data Storage

Everything is stored locally in `~/.tend/`:

```
~/.tend/
├── config.json    # active garden/season, units preference
└── tend.db        # SQLite database (7 tables)
```

### Database Schema

| Table | Purpose |
|---|---|
| `gardens` | Garden identity (name) |
| `seasons` | Growing years with frost dates |
| `spaces` | Physical growing locations |
| `plantings` | Crops tracked through growth stages |
| `events` | Immutable activity journal |
| `tasks` | To-do items with priority and due dates |
| `seed_plans` | Seed starting schedule with target dates |

## Development

```bash
# Run directly
bun run src/cli.ts <command>

# Run tests (62 tests across 4 files)
bun test

# Type check
bun run typecheck

# Build to dist/
bun run build
```

### Project Structure

```
src/
├── cli.ts                # CLI entry point (Commander.js)
├── commands/
│   ├── init.ts           # Init command
│   ├── season.ts         # Season commands
│   ├── format.ts         # Display formatting (humanize, dates, padding)
│   ├── output.ts         # JSON/error output helpers
│   └── validate.ts       # Input validation with friendly errors
├── db/
│   ├── connection.ts     # SQLite connection + config management
│   ├── ids.ts            # ID generation
│   ├── repo.ts           # Data access layer (CRUD for all tables)
│   └── schema.ts         # DDL for all 7 tables
└── services/
    ├── errors.ts         # TendError class
    └── garden.ts         # Business logic (summary, week plan, scheduling)

test/
├── cli.test.ts           # 26 end-to-end CLI integration tests
├── repo.test.ts          # 17 repository unit tests
├── services.test.ts      # 4 service logic tests
├── plan.test.ts          # 15 seed plan tests
└── helpers.ts            # Test utilities
```

## Tech Stack

- **Runtime:** [Bun](https://bun.sh)
- **Language:** TypeScript
- **Database:** SQLite (via `bun:sqlite`)
- **CLI Framework:** [Commander.js](https://github.com/tj/commander.js/)
- **Architecture:** CLI → Commands → Services → Repository → SQLite
