# Colt Tracker Architecture Notes

## Current State

Colt Tracker is a Vite + React + TypeScript frontend app backed by a TypeScript API. In local
development, `npm run dev` starts both Vite and a local Node backend; Vite proxies `/api/*` to that
backend. The local backend and deployed dev Lambda both use Aurora PostgreSQL through the RDS Data
API, so app data persists across browser refreshes.

The frontend types in `src/types.ts` intentionally match the relational database shape. The app is
for one ultimate frisbee team only, so do not add a `teams` table unless the product direction
changes.

## Cloud Architecture

The current deployment path is:

- React + TypeScript frontend.
- Static frontend hosting on S3 and CloudFront.
- HTTP API Gateway invoking a TypeScript Lambda backend.
- Aurora PostgreSQL Serverless v2 for persistence.
- RDS Data API for Lambda and local backend database access.
- Secrets Manager for generated database credentials.
- Terraform-managed AWS infrastructure.
- Signed 24-hour password sessions with viewer and admin roles.

The frontend checks session state before requesting application data. Viewer sessions are limited to
aggregate statistics endpoints. Admin pages load and cache route-scoped payloads for roster,
tournament, and game workflows instead of loading the complete database at startup.

The browser never connects directly to PostgreSQL. React calls API Gateway in deployed
environments, and calls the local backend through Vite's `/api` proxy during local development.
Lambda validates requests, performs transactional writes where needed, and returns JSON.

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

The implemented Postgres shape is:

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
  - `events.payload jsonb`, with typed API validation.
  - Examples: pull hang time, pull in bounds, throw type, stall count, force, call type, defensive
    matchup, pressure, etc.

If a detail becomes heavily queried or shared across many event types, it can later be promoted into
a dedicated column or companion detail table.

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

When changing persistent storage:

- Keep the frontend workflow stable.
- Keep the TypeScript API boundary between React and Postgres.
- Validate event payloads by `event_type` at the API layer.
- Treat the event log as authoritative for stat queries and timeline reconstruction.
- Preserve stable IDs for games, points, players, and events.
- Use migrations from the start for Postgres schema changes.
- Run migrations as an explicit deployment step through the migration runner Lambda.

## Backend Code Layout

- `backend/src/local.ts`: local Node HTTP server, loads `.env`.
- `backend/src/lambda.ts`: API Gateway Lambda adapter.
- `backend/src/app.ts`: route dispatcher and shared error handling.
- `backend/src/db/dataApi.ts`: RDS Data API helper, SQL parameter helpers, and transaction helpers.
- `backend/src/db/mappers.ts`: snake_case database rows to camelCase frontend types.
- `backend/src/routes`: route handlers for bootstrap, roster, tournament/game setup, and charting.
