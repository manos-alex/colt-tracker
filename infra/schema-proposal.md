# PostgreSQL Schema

The initial schema has been accepted and implemented in `migrations/001_initial_schema.sql`.

## Core Tables

- `players`: `id`, `name`, `roster_player`, `created_at`, `updated_at`
- `tournaments`: `id`, `name`, `location`, `start_date`, `end_date`, `day_count`, `created_at`, `updated_at`
- `tournament_players`: `id`, `tournament_id`, `player_id`, `created_at`
- `tournament_schedule_items`: `id`, `tournament_id`, `type`, `game_id`, `label`, `day_number`, `sort_order`, `created_at`, `updated_at`
- `games`: `id`, `tournament_id`, `opponent_name`, `game_date`, `video_url`, `our_score`, `opponent_score`, `current_possession`, `starting_possession`, `starting_endzone`, `second_half_started`, `game_finished`, `active_thrower_id`, `disc_x`, `disc_y`, `created_at`, `updated_at`
- `points`: `id`, `game_id`, `point_number`, `started_on_offense`, `our_score_start`, `opponent_score_start`, `our_score_end`, `opponent_score_end`, `scoring_team`, `initial_thrower_id`, `initial_disc_x`, `initial_disc_y`, `status`, `created_at`, `updated_at`
- `point_players`: `id`, `point_id`, `player_id`, `is_starter`, `created_at`
- `events`: `id`, `game_id`, `point_id`, `event_type`, `half`, `primary_player_id`, `secondary_player_id`, `start_x`, `start_y`, `end_x`, `end_y`, `video_seconds`, `payload`, `created_at`

## Proposed Constraints

- Use UUID primary keys.
- Do not add a `teams` table.
- Keep `players.name` as the display name; do not split name fields.
- Keep `games.video_url` YouTube-only; do not add `video_source`.
- Use checks for normalized coordinates from `0` to `1`.
- Use checks for enum-like values such as possession, schedule item type, point status, event half, and event type.
- Use `events.payload jsonb not null default '{}'::jsonb` for event-specific details like pull hang time, in-bounds pulls, throw metadata, defensive pressure, or future recordables.
- Keep `events` as the stat source of truth; derive counters in queries/views instead of storing redundant totals.

## Open Confirmation Points

- `pull_hang_time_seconds` and `pull_in_bounds` moved into `events.payload`.
- `tournament_players` prevents duplicate `(tournament_id, player_id)` rows.
- `tournament_schedule_items` prevents duplicate `(tournament_id, day_number, sort_order)` rows.
- Destructive deletes are controlled by the API instead of broad database cascades.
