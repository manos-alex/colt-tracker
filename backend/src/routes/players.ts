import type { Player } from "../../../src/types.js";
import { executeSql, sqlParam, withTransaction } from "../db/dataApi.js";
import { mapPlayer } from "../db/mappers.js";
import {
  badRequest,
  jsonResponse,
  methodNotAllowed,
  resourceNotFound,
  type ApiRequest,
  type ApiResponse,
} from "../http.js";

type CreatePlayerBody = {
  name?: unknown;
  rosterPlayer?: unknown;
};

type UpdatePlayerBody = {
  name?: unknown;
  rosterPlayer?: unknown;
};

type ValidationError = {
  error: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function handlePlayersRequest(request: ApiRequest): Promise<ApiResponse> {
  const playerId = playerIdFromPath(request.path);

  if (request.path === "/api/players") {
    if (request.method === "GET") {
      return jsonResponse(200, { players: await listPlayers() });
    }

    if (request.method === "POST") {
      return createPlayer(request.body);
    }

    return methodNotAllowed(request.method);
  }

  if (!playerId) {
    return badRequest("Player id must be a valid UUID.");
  }

  if (request.method === "PATCH") {
    return updatePlayer(playerId, request.body);
  }

  if (request.method === "DELETE") {
    return deletePlayer(playerId);
  }

  return methodNotAllowed(request.method);
}

async function listPlayers(): Promise<Player[]> {
  const result = await executeSql("select * from players order by name, created_at");
  return result.rows.map(mapPlayer);
}

async function createPlayer(body: unknown): Promise<ApiResponse> {
  if (!isObject(body)) {
    return badRequest("Request body must be a JSON object.");
  }

  const parsed = parseCreatePlayerBody(body);
  if ("error" in parsed) {
    return badRequest(parsed.error);
  }

  const result = await executeSql(
    `
      insert into players (name, roster_player)
      values (:name, :rosterPlayer)
      returning *
    `,
    [sqlParam("name", parsed.name), sqlParam("rosterPlayer", parsed.rosterPlayer)],
  );

  return jsonResponse(201, { player: mapPlayer(result.rows[0]) });
}

async function updatePlayer(playerId: string, body: unknown): Promise<ApiResponse> {
  if (!isObject(body)) {
    return badRequest("Request body must be a JSON object.");
  }

  const parsed = parseUpdatePlayerBody(body);
  if ("error" in parsed) {
    return badRequest(parsed.error);
  }

  const updates: string[] = [];
  const parameters = [sqlParam("id", playerId)];

  if ("name" in parsed) {
    updates.push("name = :name");
    parameters.push(sqlParam("name", parsed.name));
  }

  if ("rosterPlayer" in parsed) {
    updates.push("roster_player = :rosterPlayer");
    parameters.push(sqlParam("rosterPlayer", parsed.rosterPlayer));
  }

  const result = await executeSql(
    `
      update players
      set ${updates.join(", ")}
      where id = cast(:id as uuid)
      returning *
    `,
    parameters,
  );

  const player = result.rows[0];
  if (!player) {
    return resourceNotFound("Player");
  }

  return jsonResponse(200, { player: mapPlayer(player) });
}

async function deletePlayer(playerId: string): Promise<ApiResponse> {
  const deletedPlayer = await withTransaction(async (transactionId) => {
    await executeSql(
      "delete from tournament_players where player_id = cast(:id as uuid)",
      [sqlParam("id", playerId)],
      transactionId,
    );
    await executeSql(
      "delete from point_players where player_id = cast(:id as uuid)",
      [sqlParam("id", playerId)],
      transactionId,
    );
    await executeSql(
      "update events set primary_player_id = null where primary_player_id = cast(:id as uuid)",
      [sqlParam("id", playerId)],
      transactionId,
    );
    await executeSql(
      "update events set secondary_player_id = null where secondary_player_id = cast(:id as uuid)",
      [sqlParam("id", playerId)],
      transactionId,
    );
    await executeSql(
      "update games set active_thrower_id = null where active_thrower_id = cast(:id as uuid)",
      [sqlParam("id", playerId)],
      transactionId,
    );
    await executeSql(
      "update points set initial_thrower_id = null where initial_thrower_id = cast(:id as uuid)",
      [sqlParam("id", playerId)],
      transactionId,
    );

    const result = await executeSql(
      "delete from players where id = cast(:id as uuid) returning *",
      [sqlParam("id", playerId)],
      transactionId,
    );

    return result.rows[0];
  });

  if (!deletedPlayer) {
    return resourceNotFound("Player");
  }

  return jsonResponse(200, { deletedPlayerId: playerId });
}

function parseCreatePlayerBody(
  body: CreatePlayerBody,
): { name: string; rosterPlayer: boolean } | ValidationError {
  const name = parseName(body.name);
  if ("error" in name) return name;

  if (body.rosterPlayer !== undefined && typeof body.rosterPlayer !== "boolean") {
    return { error: "rosterPlayer must be a boolean when provided." };
  }

  return {
    name: name.value,
    rosterPlayer: body.rosterPlayer ?? true,
  };
}

function parseUpdatePlayerBody(
  body: UpdatePlayerBody,
): { name?: string; rosterPlayer?: boolean } | ValidationError {
  const parsed: { name?: string; rosterPlayer?: boolean } = {};

  if (body.name !== undefined) {
    const name = parseName(body.name);
    if ("error" in name) return name;
    parsed.name = name.value;
  }

  if (body.rosterPlayer !== undefined) {
    if (typeof body.rosterPlayer !== "boolean") {
      return { error: "rosterPlayer must be a boolean when provided." };
    }

    parsed.rosterPlayer = body.rosterPlayer;
  }

  if (!("name" in parsed) && !("rosterPlayer" in parsed)) {
    return { error: "At least one of name or rosterPlayer is required." };
  }

  return parsed;
}

function parseName(value: unknown): { value: string } | ValidationError {
  if (typeof value !== "string") {
    return { error: "name is required." };
  }

  const name = value.trim();
  if (!name) {
    return { error: "name cannot be blank." };
  }

  return { value: name };
}

function playerIdFromPath(path: string) {
  const match = path.match(/^\/api\/players\/([^/]+)$/);
  if (!match) return null;

  const id = decodeURIComponent(match[1] ?? "");
  return uuidPattern.test(id) ? id : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
