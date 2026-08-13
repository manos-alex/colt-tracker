# colt-tracker

React/TypeScript app for charting one ultimate frisbee team's stats from YouTube film.

## Current State

The app now runs as a Vite React frontend plus a TypeScript serverless backend. Local development
starts both processes with `npm run dev`: Vite serves the frontend and proxies `/api/*` to the local
backend on port `8787`.

The backend reads and writes Aurora PostgreSQL through the RDS Data API. In dev, local backend code
uses the same Aurora Serverless database as the deployed Lambda, so roster, tournament, game, point,
and event data persists across refreshes.

The database tables are:

- `players`: one `name` field for display and references, plus `roster_player` for whether the player is on the core roster.
- `tournaments`
- `tournament_players`
- `tournament_schedule_items`: tournament day/order entries for both games and byes.
- `games`: YouTube URL, opponent, score, current possession, active thrower, and current disc spot.
- `points`: point number, start/end score, starting offense/defense, scoring team.
- `point_players`: players on the point, with `is_starter` for original seven vs subs.
- `events`: event type, optional primary/secondary players, video timestamp, and normalized field coordinates for disc movement.

The app flow is split into pages:

- Dashboard: empty shell for future summary statistics and modules.
- Roster: larger roster manager with player name and rostered status.
- Add Data: tournament and game management.
- Game charting: dedicated film/control-panel page opened from adding or editing a game.

The charting screen shows score and point number across the top, embeds the game film, and keeps the control panel close to the video. Offensive controls are Pass, Throwaway, Drop, and Opp Block. Defensive controls are Opponent Score, Turnover, Block, and Callahan. Injuries are handled through the line/substitution flow.

## Commands

```sh
npm install
npm run dev
npm run build
```

## Local Backend Environment

Create a repo-root `.env` file for local backend development:

```sh
AWS_PROFILE=colt-dev-deploy
AWS_REGION=us-east-1
DB_CLUSTER_ARN=...
DB_SECRET_ARN=...
DB_NAME=colttracker
ENVIRONMENT=local
PORT=8787
```

You can populate the database values from Terraform outputs after the dev stack exists:

```sh
AWS_PROFILE=colt-dev-deploy terraform -chdir=infra output -raw database_cluster_arn
AWS_PROFILE=colt-dev-deploy terraform -chdir=infra output -raw database_secret_arn
AWS_PROFILE=colt-dev-deploy terraform -chdir=infra output -raw database_name
```

`backend/src/local.ts` loads `.env` automatically. Lambda receives equivalent values from
Terraform-managed environment variables.

## Backend API

The frontend hydrates with `GET /api/bootstrap`, which returns the full `AppData` shape. Mutations
return either the changed resource or a refreshed `AppData` payload.

Implemented route groups:

- `GET /api/health`
- `GET /api/bootstrap`
- `/api/players`: create, update, delete, and list players.
- `/api/tournaments`: create tournaments, roster tournament players, add games/byes, reorder or delete schedule items, and update day counts.
- `/api/games`: patch game state, start points, record events, finish points, and delete events.

## Dev Deployment

The backend Lambda is bundled by `npm run build` into `backend/dist/lambda/index.js`. Terraform
packages that artifact and deploys it behind API Gateway.

Manual dev flow:

```sh
npm run build
terraform -chdir=infra fmt -recursive
terraform -chdir=infra validate
terraform -chdir=infra plan -var-file=environments/dev.tfvars
terraform -chdir=infra apply -var-file=environments/dev.tfvars
AWS_PROFILE=colt-dev-deploy AWS_REGION=us-east-1 aws lambda invoke \
  --function-name "$(terraform -chdir=infra output -raw migration_runner_function_name)" \
  /tmp/colt-tracker-migrations.json
```

Then smoke test:

```sh
curl "$(terraform -chdir=infra output -raw api_endpoint)/api/health"
curl "$(terraform -chdir=infra output -raw api_endpoint)/api/bootstrap"
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for the AWS/PostgreSQL architecture, database
tables, and guidance for keeping events extensible as new stats and recordables are added.
