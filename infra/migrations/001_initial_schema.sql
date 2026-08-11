begin;

create extension if not exists pgcrypto;

create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  roster_player boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint players_name_not_blank check (length(btrim(name)) > 0)
);

create trigger players_set_updated_at
before update on players
for each row
execute function set_updated_at();

create table tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text not null default '',
  start_date date,
  end_date date,
  day_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournaments_name_not_blank check (length(btrim(name)) > 0),
  constraint tournaments_day_count_positive check (day_count > 0),
  constraint tournaments_date_order check (end_date is null or start_date is null or end_date >= start_date)
);

create trigger tournaments_set_updated_at
before update on tournaments
for each row
execute function set_updated_at();

create table tournament_players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id),
  player_id uuid not null references players (id),
  created_at timestamptz not null default now(),
  constraint tournament_players_unique_player unique (tournament_id, player_id)
);

create table games (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id),
  opponent_name text not null,
  game_date date,
  video_url text not null default '',
  our_score integer not null default 0,
  opponent_score integer not null default 0,
  current_possession text not null default 'us',
  starting_possession text,
  starting_endzone text,
  second_half_started boolean not null default false,
  game_finished boolean not null default false,
  active_thrower_id uuid references players (id) on delete set null,
  disc_x double precision,
  disc_y double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint games_opponent_name_not_blank check (length(btrim(opponent_name)) > 0),
  constraint games_score_nonnegative check (our_score >= 0 and opponent_score >= 0),
  constraint games_current_possession_valid check (current_possession in ('us', 'opponent')),
  constraint games_starting_possession_valid check (starting_possession is null or starting_possession in ('us', 'opponent')),
  constraint games_starting_endzone_valid check (starting_endzone is null or starting_endzone in ('left', 'right')),
  constraint games_disc_x_normalized check (disc_x is null or (disc_x >= 0 and disc_x <= 1)),
  constraint games_disc_y_normalized check (disc_y is null or (disc_y >= 0 and disc_y <= 1)),
  constraint games_disc_coordinates_pair check ((disc_x is null and disc_y is null) or (disc_x is not null and disc_y is not null))
);

create trigger games_set_updated_at
before update on games
for each row
execute function set_updated_at();

create table tournament_schedule_items (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id),
  type text not null,
  game_id uuid references games (id),
  label text,
  day_number integer not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournament_schedule_items_type_valid check (type in ('game', 'bye')),
  constraint tournament_schedule_items_day_positive check (day_number > 0),
  constraint tournament_schedule_items_sort_order_nonnegative check (sort_order >= 0),
  constraint tournament_schedule_items_game_shape check (
    (type = 'game' and game_id is not null)
    or (type = 'bye' and game_id is null)
  ),
  constraint tournament_schedule_items_unique_order unique (tournament_id, day_number, sort_order),
  constraint tournament_schedule_items_unique_game unique (game_id)
);

create trigger tournament_schedule_items_set_updated_at
before update on tournament_schedule_items
for each row
execute function set_updated_at();

create table points (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id),
  point_number integer not null,
  started_on_offense boolean not null,
  our_score_start integer not null,
  opponent_score_start integer not null,
  our_score_end integer,
  opponent_score_end integer,
  scoring_team text,
  initial_thrower_id uuid references players (id) on delete set null,
  initial_disc_x double precision,
  initial_disc_y double precision,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint points_point_number_positive check (point_number > 0),
  constraint points_start_score_nonnegative check (our_score_start >= 0 and opponent_score_start >= 0),
  constraint points_end_score_nonnegative check (
    (our_score_end is null or our_score_end >= 0)
    and (opponent_score_end is null or opponent_score_end >= 0)
  ),
  constraint points_scoring_team_valid check (scoring_team is null or scoring_team in ('us', 'opponent')),
  constraint points_status_valid check (status in ('active', 'complete')),
  constraint points_initial_disc_x_normalized check (initial_disc_x is null or (initial_disc_x >= 0 and initial_disc_x <= 1)),
  constraint points_initial_disc_y_normalized check (initial_disc_y is null or (initial_disc_y >= 0 and initial_disc_y <= 1)),
  constraint points_initial_disc_coordinates_pair check (
    (initial_disc_x is null and initial_disc_y is null)
    or (initial_disc_x is not null and initial_disc_y is not null)
  ),
  constraint points_complete_shape check (
    (status = 'active' and our_score_end is null and opponent_score_end is null and scoring_team is null)
    or (status = 'complete' and our_score_end is not null and opponent_score_end is not null and scoring_team is not null)
  ),
  constraint points_unique_point_number unique (game_id, point_number)
);

create trigger points_set_updated_at
before update on points
for each row
execute function set_updated_at();

create table point_players (
  id uuid primary key default gen_random_uuid(),
  point_id uuid not null references points (id),
  player_id uuid not null references players (id),
  is_starter boolean not null,
  created_at timestamptz not null default now(),
  constraint point_players_unique_player unique (point_id, player_id)
);

create table events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id),
  point_id uuid references points (id),
  event_type text not null,
  half integer not null,
  primary_player_id uuid references players (id) on delete set null,
  secondary_player_id uuid references players (id) on delete set null,
  start_x double precision,
  start_y double precision,
  end_x double precision,
  end_y double precision,
  video_seconds integer not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint events_event_type_valid check (
    event_type in (
      'pull',
      'pass',
      'turnover',
      'throwaway',
      'drop',
      'opponent_block',
      'block',
      'opponent_turnover',
      'opponent_score',
      'callahan',
      'injury',
      'pickup',
      'half_time',
      'full_time'
    )
  ),
  constraint events_half_valid check (half in (1, 2)),
  constraint events_video_seconds_nonnegative check (video_seconds >= 0),
  constraint events_start_x_normalized check (start_x is null or (start_x >= 0 and start_x <= 1)),
  constraint events_start_y_normalized check (start_y is null or (start_y >= 0 and start_y <= 1)),
  constraint events_end_x_normalized check (end_x is null or (end_x >= 0 and end_x <= 1)),
  constraint events_end_y_normalized check (end_y is null or (end_y >= 0 and end_y <= 1)),
  constraint events_start_coordinates_pair check (
    (start_x is null and start_y is null)
    or (start_x is not null and start_y is not null)
  ),
  constraint events_end_coordinates_pair check (
    (end_x is null and end_y is null)
    or (end_x is not null and end_y is not null)
  ),
  constraint events_payload_is_object check (jsonb_typeof(payload) = 'object')
);

create index tournament_players_player_id_idx on tournament_players (player_id);
create index tournament_schedule_items_tournament_day_idx on tournament_schedule_items (tournament_id, day_number, sort_order);
create index games_tournament_id_idx on games (tournament_id);
create index points_game_id_idx on points (game_id);
create index point_players_player_id_idx on point_players (player_id);
create index events_game_timeline_idx on events (game_id, video_seconds, created_at);
create index events_point_timeline_idx on events (point_id, video_seconds, created_at) where point_id is not null;
create index events_event_type_idx on events (event_type);
create index events_payload_gin_idx on events using gin (payload);

insert into schema_migrations (version)
values ('001_initial_schema')
on conflict (version) do nothing;

commit;
