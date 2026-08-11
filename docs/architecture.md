# Colt Tracker Architecture Notes

## Current State

Colt Tracker is currently a Vite + React + TypeScript frontend app. Browser persistence has been
removed; data is held in React state until the TypeScript API and PostgreSQL layer are wired in.

The frontend types in `src/types.ts` are intentionally close to the future relational database
shape. The app is for one ultimate frisbee team only, so do not add a `teams` table unless the
product direction changes.

## Planned Cloud Direction

The likely production architecture is:

- React + TypeScript frontend.
- Static frontend hosting on S3 and CloudFront.
- TypeScript API/backend, likely serverless.
- PostgreSQL database hosted on AWS.
- Terraform-managed AWS infrastructure.
- Auth/whitelist after the core charting workflow and data model stabilize.

When creating infrastructure, preserve a clean path from the current local frontend model to a
Postgres-backed API. Avoid infrastructure choices that make relational queries or event timeline
analysis difficult.

## Core Database Tables

The current app model points toward these core tables:

- `players`
- `tournaments`
- `tournament_players`
- `tournament_schedule_items`
- `games`
- `points`
- `point_players`
- `events`

Important table constraints:

- `players` should keep one display `name`, plus roster status. Do not split name into first/last,
  nickname, or number unless the product direction changes.
- `games` are always YouTube film, so no `video_source` column is needed right now.
- `tournament_schedule_items` should represent tournament day/order, including both games and byes.
  Byes are not chartable games, but should be first-class schedule items for future before/after-bye
  analysis.
- `points` should keep starting offense/defense, start/end score, scoring team, and initial disc
  state where relevant.
- `point_players` should represent who played a point, including starters and injury replacements.
- `events` should be the primary source of truth for stat analysis.

## Event Extensibility

Adding new stats or new recordable actions should be easy. The app should avoid adding a new fixed
database column for every event-specific detail unless that detail is common across many event
types.

A good future Postgres shape is:

- `events`: shared timeline fields
  - `id`
  - `game_id`
  - `point_id`
  - `event_type`
  - `half`
  - `video_seconds`
  - `primary_player_id`
  - `secondary_player_id`
  - normalized coordinates where relevant
  - `created_at`
- Event-specific details:
  - Either `events.payload jsonb`, with typed API validation, or companion detail tables.
  - Examples: pull hang time, pull in bounds, throw type, stall count, force, call type, defensive
    matchup, pressure, etc.

For the early backend, a typed JSONB payload is likely the most flexible option. If a detail becomes
heavily queried or shared across many event types, it can later be promoted into a dedicated column
or detail table.

## Event Type Guidelines

When adding a new stat or recordable, decide which category it belongs to:

- New `event_type`: a distinct timeline action, such as `pull`, `timeout`, `stall`, `foul`,
  `layout_block`, or `call`.
- Metadata on an existing event: extra detail about an action, such as throw type, pass pressure,
  break side, or whether a pull was in bounds.
- Derived stat: something computed from events, such as completion percentage, goals, blocks,
  touches, plus/minus, break chances, or performance before/after byes.

Prefer deriving stats from events rather than storing redundant counters. Dashboards can use SQL
views, materialized views, or API-level query aggregation once the event definitions stabilize.

## Coordinates

Field coordinates are normalized:

- `x`: `0` to `1`
- `y`: `0` to `1`

The regulation field model is:

- 20 yd end zone
- 70 yd playing field
- 20 yd end zone
- Total length: 110 yd
- Width: 40 yd

Dashboard/stat views can convert normalized coordinates to yards later.

## Backend Migration Notes

When adding persistent storage:

- Keep the frontend workflow stable first.
- Introduce a TypeScript API boundary before wiring in Postgres.
- Validate event payloads by `event_type` at the API layer.
- Treat the event log as authoritative for stat queries and timeline reconstruction.
- Preserve stable IDs for games, points, players, and events.
- Use migrations from the start for Postgres schema changes.
