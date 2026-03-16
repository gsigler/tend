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

**Space** — A physical growing location: raised bed, tray, container, shelf, etc. Spaces have optional dimensions and layout modes. Spaces with dimensions support grid placement for mapping where plantings are located.

**Planting** — A crop tracked through its entire lifecycle from planning to harvest. Plantings can have target schedule dates (start, harden, transplant) and grid coordinates — the plan *is* the planting from day one.

**Task** — Something to do, with optional due dates, priority levels, and space associations. Defaults to showing only open tasks.

**Event** — An immutable journal entry. Every mutation (planting, stage change, task completion) automatically creates an event, and you can log observations manually.

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

# Grid map (requires width/length on the space)
tend spaces map bed-1
tend spaces map bed-1 --json
```

**Space types:** `raised_bed`, `tray`, `container`, `row_bed`, `shelf`, `hardening_area`

**Layout modes:** `square_foot_grid`, `rows`, `cell_grid`, `none`

### Plantings

```bash
# Add plantings (with optional schedule dates and grid placement)
tend plantings add tomato --variety "San Marzano" --from Burpee --qty 12 --grid 4 \
  --space bed-1 --start-date 2026-03-01 --harden-date 2026-04-15 --transplant-date 2026-05-01
tend plantings add peas --space bed-1 --source seed --stage direct_sown --date 2026-03-15
tend plantings add lettuce --space bed-1 --variety buttercrunch --source start --stage transplanted

# Add with auto-placement on grid
tend plantings add tomato --space bed-1 --at A1,A2,B1,B2 --start-date 2026-03-01

# List (with filters)
tend plantings list
tend plantings list --crop peas
tend plantings list --space bed-1
tend plantings list --stage producing
tend plantings list --json

# Update stage (by ID or crop name) — automatically sets date fields
tend plantings update-stage tomato seeded_indoors --date 2026-03-01
tend plantings update-stage tomato hardening_off --date 2026-04-15
tend plantings update-stage tomato transplanted --date 2026-05-01

# View schedule (grouped by overdue/upcoming/done)
tend plantings schedule
tend plantings schedule --json

# Auto-generate tasks from schedule dates (idempotent — won't duplicate)
tend plantings generate-tasks

# Place on grid (assigns cells within a space)
tend plantings place tomato --space bed-1 --at A1,A2,B1,B2
tend plantings place pepper --space bed-1 --at A3,B3

# Remove from grid
tend plantings unplace tomato

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

# Weekly work plan (overdue tasks, this week's tasks, suggestions, schedule actions)
tend week
tend week --json
```

The `week` command intelligently surfaces:
- **Overdue tasks** — past their due date
- **This week's tasks** — due in the next 7 days
- **Suggested checks** — seedlings, hardening plants, or producing crops with no events in 7+ days
- **Schedule actions** — plantings needing starts, hardening, or transplants based on target dates

## JSON Output

Every read command supports `--json` for structured output, making it easy to pipe into other tools:

```bash
tend summary --json | jq '.plantings[] | .crop'
tend tasks list --json | jq '[.[] | select(.priority == "high")]'
tend plantings schedule --json | jq '.overdue'
```

## Name-Based Lookups

Most commands accept either an ID or a name. You don't need to copy-paste IDs:

```bash
# These all work:
tend plantings update-stage tomato seedling       # by crop name
tend plantings update-stage planting_abc123 seedling  # by ID

tend tasks done "Water"                           # partial title match
tend tasks done task_abc123                       # by ID

tend plantings update-stage basil seeded_indoors   # by crop name
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
| `plantings` | Crops tracked through growth stages, with schedule dates and grid placement |
| `events` | Immutable activity journal |
| `tasks` | To-do items with priority and due dates |
| `grid_placements` | Coordinate-based placement of plantings within spaces |

## Development

```bash
# Run directly
bun run src/cli.ts <command>

# Run tests (59 tests across 4 files)
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
│   ├── grid.ts           # Grid coordinate parsing, ASCII renderer, JSON builder
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
├── plan.test.ts          # 11 planting schedule tests
└── helpers.ts            # Test utilities
```

## Tech Stack

- **Runtime:** [Bun](https://bun.sh)
- **Language:** TypeScript
- **Database:** SQLite (via `bun:sqlite`)
- **CLI Framework:** [Commander.js](https://github.com/tj/commander.js/)
- **Architecture:** CLI → Commands → Services → Repository → SQLite
