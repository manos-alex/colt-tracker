# Colt Tracker Agent Notes

## Project Goal

Build a React/TypeScript app for charting and analyzing one ultimate frisbee team's stats from YouTube game film.

This is currently a frontend proof of concept. The long-term plan is:

- React + TypeScript frontend.
- Serverless backend later.
- PostgreSQL as the likely database because the data is relational and stats queries will matter.
- Terraform for AWS resources.
- S3/CloudFront for hosting the frontend eventually.
- Auth/whitelist can wait until after the core workflow is right.

## Current App Shape

The app is Vite + React + TypeScript and uses `localStorage` for temporary persistence.

Main commands:

```sh
npm install
npm run dev
npm run build
```

Always run `npm run build` after code changes.

## Pages

- Dashboard: landing page, intentionally empty for future statistics modules.
- Roster: manage players. A player has `name` and `rosterPlayer`.
- Add Data: manage tournaments and games.
- Game charting: embedded YouTube video, score bar, control panel, and event log.

## Data Model Direction

Current frontend types represent the future database tables:

- `players`
- `tournaments`
- `tournament_players`
- `games`
- `points`
- `point_players`
- `events`

There will always be one team, so do not add a `teams` table unless the user explicitly changes direction.

Important table notes:

- `players` uses one display `name`, not first/last/nickname/number.
- `games` are always YouTube, so no `video_source`.
- `events` include video timestamps and normalized field coordinates where relevant.
- Pass coordinates are normalized `x`/`y` from `0` to `1`; dashboard/stat views can convert later to yards on a 110 yd x 40 yd field.
- The field is 20 yd end zone, 70 yd playing field, 20 yd end zone.

## Charting Workflow

The score bar shows who started the current point on offense. It should not change during live turnovers within that point.

Point setup:

- User selects offense/defense and exactly seven players.
- Button is `Confirm Line`.
- On defense, confirming the line starts the point.
- On offense, confirming the line opens the disc-start step.
- Disc-start step lets the user pick who catches/picks up the pull and where the disc starts.

Active point default control panel:

- Top row shows `7-on:` and current active players.
- Injury button lives at the end of that row.
- Right side shows `{player} has the disc` or opponent possession.
- Event buttons are centered in a 2x2 grid.

Offense buttons:

- Pass: green. Opens field UI and receiver selection.
- Throwaway: orange. Records thrower.
- Drop: purple. Select receiver; record receiver primary and thrower secondary.
- Opp Block: red. Records thrower.

Defense buttons:

- Opponent Score: red. Ends point for opponent.
- Turnover: purple. Records opponent turnover, then prompts for our pickup player/location.
- Block: blue. Select block player, then prompts for our pickup player/location.
- Callahan: green. Select scoring defender; ends point for us.

Injuries:

- No generic stoppage tracking.
- Injury opens a sub UI.
- User selects who comes off from the current active 7-on players using buttons.
- User selects who comes on from eligible roster players using a dropdown.
- The injured player should disappear from the active `7-on:` list and the incoming player should appear.

Event log:

- Shows all logged events for the game.
- It should be independently scrollable.

## UI Preferences

- Keep the app functional-first, not a marketing landing page.
- Avoid dummy dashboard data unless the user asks for it.
- Prefer compact, efficient charting controls.
- For selecting one of the active players on the field, prefer buttons over dropdowns.
- Use dropdowns only when selecting from a broader roster list, such as injury replacement coming on.

## Near-Term Direction

The current priority is still getting the frontend PoC workflow right.

Likely next steps:

- Continue refining stat-entry speed and correctness.
- Add edit/delete/undo for mistaken events.
- Add basic game summary stats once event definitions settle.
- Then turn the TypeScript types into a real Postgres schema.
- Then add a TypeScript API/backend and replace `localStorage`.
- Auth, AWS, and Terraform come after the core charting workflow is stable.
