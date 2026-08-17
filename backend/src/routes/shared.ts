import type { AppData, EventType, FieldCoordinate, Game, Id, Possession } from "../../../src/types.js";
import { executeSql, sqlParam, withTransaction } from "../db/dataApi.js";

export type ValidationError = {
  error: string;
};

export type MutationResult = {
  data: AppData;
};

export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const eventTypes = new Set<EventType>([
  "pull",
  "catch",
  "pass",
  "turnover",
  "throwaway",
  "drop",
  "opponent_block",
  "block",
  "opponent_turnover",
  "opponent_score",
  "callahan",
  "injury",
  "pickup",
  "half_time",
  "full_time",
]);

export async function mutateAndReturnData(
  mutation: (transactionId: string) => Promise<void>,
  loadData: () => Promise<AppData>,
): Promise<MutationResult> {
  await withTransaction(mutation);
  return { data: await loadData() };
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseUuid(value: unknown, label: string): { value: Id } | ValidationError {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    return { error: `${label} must be a valid UUID.` };
  }

  return { value };
}

export function parseOptionalUuid(
  value: unknown,
  label: string,
): { value: Id | null } | ValidationError {
  if (value === null || value === undefined || value === "") {
    return { value: null };
  }

  return parseUuid(value, label);
}

export function parseString(value: unknown, label: string): { value: string } | ValidationError {
  if (typeof value !== "string") {
    return { error: `${label} is required.` };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { error: `${label} cannot be blank.` };
  }

  return { value: trimmed };
}

export function parseOptionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseInteger(value: unknown, label: string): { value: number } | ValidationError {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return { error: `${label} must be an integer.` };
  }

  return { value };
}

export function parseNumber(value: unknown, label: string): { value: number } | ValidationError {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { error: `${label} must be a number.` };
  }

  return { value };
}

export function parseBoolean(value: unknown, label: string): { value: boolean } | ValidationError {
  if (typeof value !== "boolean") {
    return { error: `${label} must be a boolean.` };
  }

  return { value };
}

export function parsePossession(value: unknown, label: string): { value: Possession } | ValidationError {
  if (value !== "us" && value !== "opponent") {
    return { error: `${label} must be us or opponent.` };
  }

  return { value };
}

export function parseCoordinate(
  value: unknown,
  label: string,
): { value: FieldCoordinate } | ValidationError {
  if (!isObject(value)) {
    return { error: `${label} is required.` };
  }

  const x = parseNormalizedNumber(value.x, `${label}.x`);
  if ("error" in x) return x;

  const y = parseNormalizedNumber(value.y, `${label}.y`);
  if ("error" in y) return y;

  return { value: { x: x.value, y: y.value } };
}

export function parseOptionalCoordinate(
  value: unknown,
  label: string,
): { value: FieldCoordinate | null } | ValidationError {
  if (value === null || value === undefined) {
    return { value: null };
  }

  return parseCoordinate(value, label);
}

export function parseEventType(value: unknown): { value: EventType } | ValidationError {
  if (typeof value !== "string" || !eventTypes.has(value as EventType)) {
    return { error: "eventType is invalid." };
  }

  return { value: value as EventType };
}

export async function updateGamePatch(
  gameId: Id,
  patch: Partial<Game>,
  transactionId: string,
): Promise<void> {
  const assignments: string[] = [];
  const parameters = [sqlParam("gameId", gameId)];

  const add = (column: string, parameterName: string, value: unknown, cast?: string) => {
    assignments.push(`${column} = ${cast ? `cast(:${parameterName} as ${cast})` : `:${parameterName}`}`);
    parameters.push(sqlParam(parameterName, value));
  };

  if (patch.opponentName !== undefined) add("opponent_name", "opponentName", patch.opponentName);
  if (patch.gameDate !== undefined) add("game_date", "gameDate", patch.gameDate || null, "date");
  if (patch.videoUrl !== undefined) add("video_url", "videoUrl", patch.videoUrl);
  if (patch.ourScore !== undefined) add("our_score", "ourScore", patch.ourScore);
  if (patch.opponentScore !== undefined) add("opponent_score", "opponentScore", patch.opponentScore);
  if (patch.currentPossession !== undefined) {
    add("current_possession", "currentPossession", patch.currentPossession);
  }
  if (patch.startingPossession !== undefined) {
    add("starting_possession", "startingPossession", patch.startingPossession);
  }
  if (patch.startingEndzone !== undefined) add("starting_endzone", "startingEndzone", patch.startingEndzone);
  if (patch.secondHalfStarted !== undefined) {
    add("second_half_started", "secondHalfStarted", patch.secondHalfStarted);
  }
  if (patch.gameFinished !== undefined) add("game_finished", "gameFinished", patch.gameFinished);
  if (patch.activeThrowerId !== undefined) {
    add("active_thrower_id", "activeThrowerId", patch.activeThrowerId, "uuid");
  }
  if (patch.discX !== undefined) add("disc_x", "discX", patch.discX);
  if (patch.discY !== undefined) add("disc_y", "discY", patch.discY);

  if (assignments.length === 0) return;

  await executeSql(
    `
      update games
      set ${assignments.join(", ")}
      where id = cast(:gameId as uuid)
    `,
    parameters,
    transactionId,
  );
}

export async function insertEvent(
  input: {
    gameId: Id;
    pointId: Id | null;
    eventType: EventType;
    half: 1 | 2;
    playerId?: Id | null;
    secondaryPlayerId?: Id | null;
    start?: FieldCoordinate | null;
    end?: FieldCoordinate | null;
    pullHangTimeSeconds?: number | null;
    pullInBounds?: boolean | null;
    fromPull?: boolean | null;
    videoSeconds: number;
  },
  transactionId: string,
): Promise<void> {
  await executeSql(
    `
      insert into events (
        game_id,
        point_id,
        event_type,
        half,
        primary_player_id,
        secondary_player_id,
        start_x,
        start_y,
        end_x,
        end_y,
        video_seconds,
        payload
      )
      values (
        cast(:gameId as uuid),
        cast(:pointId as uuid),
        :eventType,
        :half,
        cast(:playerId as uuid),
        cast(:secondaryPlayerId as uuid),
        :startX,
        :startY,
        :endX,
        :endY,
        :videoSeconds,
        cast(:payload as jsonb)
      )
    `,
    [
      sqlParam("gameId", input.gameId),
      sqlParam("pointId", input.pointId),
      sqlParam("eventType", input.eventType),
      sqlParam("half", input.half),
      sqlParam("playerId", input.playerId ?? null),
      sqlParam("secondaryPlayerId", input.secondaryPlayerId ?? null),
      sqlParam("startX", input.start?.x ?? null),
      sqlParam("startY", input.start?.y ?? null),
      sqlParam("endX", input.end?.x ?? null),
      sqlParam("endY", input.end?.y ?? null),
      sqlParam("videoSeconds", input.videoSeconds),
      sqlParam(
        "payload",
        JSON.stringify({
          ...(input.pullHangTimeSeconds === null || input.pullHangTimeSeconds === undefined
            ? {}
            : { pullHangTimeSeconds: input.pullHangTimeSeconds }),
          ...(input.pullInBounds === null || input.pullInBounds === undefined
            ? {}
            : { pullInBounds: input.pullInBounds }),
          ...(input.fromPull === null || input.fromPull === undefined
            ? {}
            : { fromPull: input.fromPull }),
        }),
      ),
    ],
    transactionId,
  );
}

function parseNormalizedNumber(value: unknown, label: string): { value: number } | ValidationError {
  const parsed = parseNumber(value, label);
  if ("error" in parsed) return parsed;

  if (parsed.value < 0 || parsed.value > 1) {
    return { error: `${label} must be between 0 and 1.` };
  }

  return parsed;
}
