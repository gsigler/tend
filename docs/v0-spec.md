# TEND CLI — V0 SPECIFICATION

> Note: This spec was originally written as "Garden CLI" and renamed to "Tend CLI".
> All CLI commands use `tend` instead of `garden`. Local storage is in `~/.tend/`.

## Overview

Tend CLI is a local-first command line tool for tracking and managing a personal garden.

The tool stores structured garden state in a local SQLite database and exposes CLI commands to manage:
- garden layout
- plantings
- events and journal history
- tasks
- weekly planning

The CLI is also designed to be usable by AI tools via JSON output.

This document defines the initial V0 implementation.

---

## GOALS

V0 should enable a gardener to:
1. Initialize a garden workspace locally
2. Define growing spaces (beds, trays, containers)
3. Record plantings
4. Track planting lifecycle stages
5. Log observations and harvests
6. Track tasks
7. View a weekly work plan
8. Maintain a durable garden journal
9. Output structured JSON for automation

V0 should be usable for an entire garden season.

---

## NON-GOALS (V0)

The following are explicitly out of scope:
- weather integration
- cloud sync
- multi-user collaboration
- accounts/authentication
- crop encyclopedia
- visual garden editor
- image recognition
- push notifications
- mobile UI
- API server

These can be added later once the CLI workflow is proven.

---

## ARCHITECTURE

The system runs as a single Bun CLI process.

```
tend CLI
↓
command handlers
↓
service layer
↓
repository / database layer
↓
SQLite database
```

No HTTP API is required for V0.

---

## TECH STACK

**Runtime:** Bun, TypeScript
**Database:** SQLite (Bun SQLite driver)
**Libraries:** zod for validation, commander for CLI parsing

---

## LOCAL STORAGE

All local data lives in `~/.tend/`:

```
~/.tend/
  config.json
  tend.db
```

---

## DATA MODEL

V0 uses six tables: gardens, seasons, spaces, plantings, events, tasks.

See `src/db/schema.ts` for the full schema definition.

---

## CLI COMMANDS

```
tend init
tend summary [--json]
tend week [--json]
tend season create --name <name> --year <year>
tend season use <seasonId>
tend season list [--json]
tend spaces add <name> --type <type> [--layout <mode>] [--width <n>] [--length <n>] [--unit <unit>]
tend spaces list [--json]
tend plantings add <crop> [--space <name>] [--variety <v>] [--source <type>] [--stage <stage>] [--qty <n>] [--qty-unit <unit>] [--date <date>]
tend plantings list [--space <name>] [--stage <stage>] [--crop <crop>] [--json]
tend plantings update-stage <plantingId> <stage> [--date <date>]
tend tasks add <title> [--space <name>] [--type <type>] [--priority <p>] [--due <date>]
tend tasks list [--status <s>] [--space <name>] [--due-before <date>] [--json]
tend tasks done <taskId>
tend events list [--planting <id>] [--space <name>] [--limit <n>] [--json]
tend log [--space <name>] [--planting <id>] [--type <type>] [--note <text>] [--data <json>] [--date <date>]
```
