# Local Backend Development Against Dev Database

The dev Aurora database is private. Do not make it public for local development.

Local backend code uses Aurora's Data API. The app stack enables the Data API and stores database
credentials in Secrets Manager, so local development does not need a public database endpoint,
tunnel, or direct PostgreSQL connection.

## Environment

Create a repo-root `.env` file after the dev stack has been applied:

```sh
AWS_PROFILE=colt-dev-deploy
AWS_REGION=us-east-1
DB_CLUSTER_ARN=...
DB_SECRET_ARN=...
DB_NAME=colttracker
ENVIRONMENT=local
PORT=8787
ADMIN_SITE_PASSWORD=...
VIEWER_SITE_PASSWORD=...
SESSION_SECRET=...
```

Get the database values from Terraform outputs:

```sh
AWS_PROFILE=colt-dev-deploy terraform -chdir=infra output -raw aws_region
AWS_PROFILE=colt-dev-deploy terraform -chdir=infra output -raw database_cluster_arn
AWS_PROFILE=colt-dev-deploy terraform -chdir=infra output -raw database_secret_arn
AWS_PROFILE=colt-dev-deploy terraform -chdir=infra output -raw database_name
```

`backend/src/local.ts` loads `.env` automatically through `dotenv/config`. The frontend does not
read the database environment variables; it calls `/api/*`.

## Run Locally

```sh
npm install
npm run dev
```

This starts:

- Vite frontend on `http://localhost:5173`.
- Local backend on `http://localhost:8787`.
- Vite proxy from `/api/*` to the local backend.

Smoke test the local backend directly:

```sh
curl http://localhost:8787/api/health
curl http://localhost:8787/api/session
```

Smoke test through Vite's proxy:

```sh
curl http://localhost:5173/api/health
curl http://localhost:5173/api/session
```

## API Shape

The local and deployed backend expose the same routes:

- `GET /api/health`
- `/api/session`
- `/api/players`
- `/api/tournaments`
- `/api/games`

After authentication, admin pages load only the data needed by the current route. The browser caches
each route payload for the current tab session, and mutation routes return a refreshed payload for
only the affected tournament or game.

## Tradeoff

Data API is easy and secure for local development and serverless Lambda code. If the backend later
needs long transactions, high-throughput queries, or PostgreSQL driver features that Data API does
not expose well, add an SSM tunnel or RDS Proxy path instead of making the database public.
