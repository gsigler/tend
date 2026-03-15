# tend

Local-first CLI for tracking and managing a personal garden. SQLite-backed, JSON-friendly, designed for a full growing season.

## Setup

```bash
# Install Bun if you don't have it
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install

# Initialize your garden
bun run src/cli.ts init --name "My Garden" --year 2026
```

## Usage

```bash
# Add growing spaces
bun run src/cli.ts spaces add bed-1 --type raised_bed --layout square_foot_grid --width 12 --length 2 --unit ft
bun run src/cli.ts spaces add bed-2 --type raised_bed --layout square_foot_grid --width 12 --length 2 --unit ft

# Add plantings
bun run src/cli.ts plantings add peas --space bed-1 --source seed --stage direct_sown --date 2026-03-15
bun run src/cli.ts plantings add lettuce --space bed-2 --variety buttercrunch --source start --stage transplanted --qty 4 --qty-unit squares --date 2026-03-15

# Add tasks
bun run src/cli.ts tasks add "Check peas for germination" --space bed-1 --type check --priority medium --due 2026-03-22

# Log observations
bun run src/cli.ts log --space bed-1 --type observed --note "soil still cool but moist" --date 2026-03-16

# View your garden
bun run src/cli.ts summary
bun run src/cli.ts week
bun run src/cli.ts events list --limit 10
```

## Commands

| Command | Description |
|---|---|
| `tend init` | Initialize garden workspace (`~/.tend/`) |
| `tend summary` | Show garden overview |
| `tend week` | Weekly work plan with overdue + suggestions |
| `tend season create` | Create a new season |
| `tend season use <id>` | Switch active season |
| `tend season list` | List seasons |
| `tend spaces add <name>` | Add a growing space |
| `tend spaces list` | List spaces |
| `tend plantings add <crop>` | Add a planting |
| `tend plantings list` | List plantings |
| `tend plantings update-stage <id> <stage>` | Update planting stage |
| `tend tasks add <title>` | Add a task |
| `tend tasks list` | List tasks |
| `tend tasks done <id>` | Complete a task |
| `tend events list` | View event timeline |
| `tend log` | Add a journal entry |

All read commands support `--json` for structured output.

## Data

Everything is stored locally in `~/.tend/`:

- `config.json` — active garden/season config
- `tend.db` — SQLite database

## Tech

Bun · TypeScript · SQLite · Commander · Zod
