# colt-tracker

React/TypeScript app for charting one ultimate frisbee team's stats from YouTube film.

## Current State

The frontend currently keeps data in React state while the API and PostgreSQL persistence layer are
being built. Refreshing the browser resets local session data. The important future database tables
are represented as TypeScript types:

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

## Architecture

See [docs/architecture.md](docs/architecture.md) for the planned AWS/PostgreSQL direction, future
database tables, and guidance for keeping events extensible as new stats and recordables are added.
