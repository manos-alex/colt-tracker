import type {
  Event,
  Game,
  Player,
  Point,
  PointPlayer,
  Tournament,
  TournamentPlayer,
  TournamentScheduleItem,
} from "../../../src/types.js";

type DbRow = Record<string, unknown>;

export function mapPlayer(row: DbRow): Player {
  return {
    id: stringValue(row.id),
    name: stringValue(row.name),
    rosterPlayer: booleanValue(row.roster_player),
    createdAt: timestampValue(row.created_at),
    updatedAt: timestampValue(row.updated_at),
  };
}

export function mapTournament(row: DbRow): Tournament {
  return {
    id: stringValue(row.id),
    name: stringValue(row.name),
    location: stringValue(row.location),
    startDate: nullableDateValue(row.start_date) ?? "",
    endDate: nullableDateValue(row.end_date) ?? "",
    dayCount: numberValue(row.day_count),
    createdAt: timestampValue(row.created_at),
    updatedAt: timestampValue(row.updated_at),
  };
}

export function mapTournamentPlayer(row: DbRow): TournamentPlayer {
  return {
    id: stringValue(row.id),
    tournamentId: stringValue(row.tournament_id),
    playerId: stringValue(row.player_id),
    createdAt: timestampValue(row.created_at),
  };
}

export function mapTournamentScheduleItem(row: DbRow): TournamentScheduleItem {
  return {
    id: stringValue(row.id),
    tournamentId: stringValue(row.tournament_id),
    type: row.type === "bye" ? "bye" : "game",
    gameId: nullableStringValue(row.game_id),
    label: nullableStringValue(row.label),
    dayNumber: numberValue(row.day_number),
    sortOrder: numberValue(row.sort_order),
    createdAt: timestampValue(row.created_at),
    updatedAt: timestampValue(row.updated_at),
  };
}

export function mapGame(row: DbRow): Game {
  return {
    id: stringValue(row.id),
    tournamentId: stringValue(row.tournament_id),
    opponentName: stringValue(row.opponent_name),
    gameDate: nullableDateValue(row.game_date) ?? "",
    videoUrl: stringValue(row.video_url),
    ourScore: numberValue(row.our_score),
    opponentScore: numberValue(row.opponent_score),
    currentPossession: row.current_possession === "opponent" ? "opponent" : "us",
    startingPossession:
      row.starting_possession === "us" || row.starting_possession === "opponent"
        ? row.starting_possession
        : null,
    startingEndzone:
      row.starting_endzone === "left" || row.starting_endzone === "right"
        ? row.starting_endzone
        : null,
    secondHalfStarted: booleanValue(row.second_half_started),
    gameFinished: booleanValue(row.game_finished),
    activeThrowerId: nullableStringValue(row.active_thrower_id),
    discX: nullableNumberValue(row.disc_x),
    discY: nullableNumberValue(row.disc_y),
    createdAt: timestampValue(row.created_at),
    updatedAt: timestampValue(row.updated_at),
  };
}

export function mapPoint(row: DbRow): Point {
  return {
    id: stringValue(row.id),
    gameId: stringValue(row.game_id),
    pointNumber: numberValue(row.point_number),
    startedOnOffense: booleanValue(row.started_on_offense),
    ourScoreStart: numberValue(row.our_score_start),
    opponentScoreStart: numberValue(row.opponent_score_start),
    ourScoreEnd: nullableNumberValue(row.our_score_end),
    opponentScoreEnd: nullableNumberValue(row.opponent_score_end),
    scoringTeam: row.scoring_team === "us" || row.scoring_team === "opponent" ? row.scoring_team : null,
    initialThrowerId: nullableStringValue(row.initial_thrower_id),
    initialDiscX: nullableNumberValue(row.initial_disc_x),
    initialDiscY: nullableNumberValue(row.initial_disc_y),
    status: row.status === "complete" ? "complete" : "active",
    createdAt: timestampValue(row.created_at),
    updatedAt: timestampValue(row.updated_at),
  };
}

export function mapPointPlayer(row: DbRow): PointPlayer {
  return {
    id: stringValue(row.id),
    pointId: stringValue(row.point_id),
    playerId: stringValue(row.player_id),
    isStarter: booleanValue(row.is_starter),
    createdAt: timestampValue(row.created_at),
  };
}

export function mapEvent(row: DbRow): Event {
  const payload = parsePayload(row.payload);

  return {
    id: stringValue(row.id),
    gameId: stringValue(row.game_id),
    pointId: nullableStringValue(row.point_id),
    eventType: stringValue(row.event_type) as Event["eventType"],
    half: numberValue(row.half) === 2 ? 2 : 1,
    playerId: nullableStringValue(row.primary_player_id),
    secondaryPlayerId: nullableStringValue(row.secondary_player_id),
    startX: nullableNumberValue(row.start_x),
    startY: nullableNumberValue(row.start_y),
    endX: nullableNumberValue(row.end_x),
    endY: nullableNumberValue(row.end_y),
    pullHangTimeSeconds: nullableNumberValue(payload.pullHangTimeSeconds),
    pullInBounds: nullableBooleanValue(payload.pullInBounds),
    videoSeconds: numberValue(row.video_seconds),
    createdAt: timestampValue(row.created_at),
  };
}

export function eventPayloadFromApi(event: Pick<Event, "pullHangTimeSeconds" | "pullInBounds">) {
  return {
    ...(event.pullHangTimeSeconds === null ? {} : { pullHangTimeSeconds: event.pullHangTimeSeconds }),
    ...(event.pullInBounds === null ? {} : { pullInBounds: event.pullInBounds }),
  };
}

function parsePayload(value: unknown): DbRow {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as DbRow;
  if (typeof value !== "string") return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function nullableStringValue(value: unknown): string | null {
  return value === null || value === undefined ? null : stringValue(value);
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function nullableNumberValue(value: unknown): number | null {
  return value === null || value === undefined ? null : numberValue(value);
}

function booleanValue(value: unknown): boolean {
  return value === true || value === "true";
}

function nullableBooleanValue(value: unknown): boolean | null {
  return value === null || value === undefined ? null : booleanValue(value);
}

function nullableDateValue(value: unknown): string | null {
  return nullableStringValue(value);
}

function timestampValue(value: unknown): string {
  const rawValue = stringValue(value);
  const date = new Date(rawValue);
  return Number.isNaN(date.getTime()) ? rawValue : date.toISOString();
}
