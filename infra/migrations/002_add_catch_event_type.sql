begin;

alter table events
drop constraint if exists events_event_type_valid;

alter table events
add constraint events_event_type_valid check (
  event_type in (
    'pull',
    'catch',
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
);

insert into schema_migrations (version)
values ('002_add_catch_event_type')
on conflict (version) do nothing;

commit;
