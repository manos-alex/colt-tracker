import { executeSql, sqlParam } from "../db/dataApi.js";
import { badRequest, jsonResponse, methodNotAllowed, type ApiRequest, type ApiResponse } from "../http.js";
import {
  isObject,
  mutateAndReturnData,
  parseInteger,
  parseOptionalString,
  parseString,
  parseUuid,
} from "./shared.js";

export async function handleTournamentsRequest(request: ApiRequest): Promise<ApiResponse> {
  if (request.path === "/api/tournaments") {
    if (request.method === "POST") {
      return createTournament(request.body);
    }

    return methodNotAllowed(request.method);
  }

  const tournamentRoute = parseTournamentRoute(request.path);
  if (!tournamentRoute) {
    return badRequest("Tournament route is invalid.");
  }

  const tournamentId = parseUuid(tournamentRoute.tournamentId, "tournamentId");
  if ("error" in tournamentId) return badRequest(tournamentId.error);

  if (request.method === "DELETE" && tournamentRoute.rest === "") {
    return removeTournament(tournamentId.value);
  }

  if (request.method === "POST" && tournamentRoute.rest === "players/toggle") {
    return toggleTournamentPlayer(tournamentId.value, request.body);
  }

  if (request.method === "PUT" && tournamentRoute.rest === "players/rostered") {
    return selectRosteredTournamentPlayers(tournamentId.value);
  }

  if (request.method === "POST" && tournamentRoute.rest === "games") {
    return createGame(tournamentId.value, request.body);
  }

  if (request.method === "POST" && tournamentRoute.rest === "byes") {
    return createBye(tournamentId.value, request.body);
  }

  if (request.method === "PATCH" && tournamentRoute.rest === "day-count") {
    return updateDayCount(tournamentId.value, request.body);
  }

  const moveScheduleMatch = tournamentRoute.rest.match(/^schedule-items\/([^/]+)\/move$/);
  if (request.method === "POST" && moveScheduleMatch) {
    return moveScheduleItem(tournamentId.value, moveScheduleMatch[1] ?? "", request.body);
  }

  const deleteScheduleMatch = tournamentRoute.rest.match(/^schedule-items\/([^/]+)$/);
  if (request.method === "DELETE" && deleteScheduleMatch) {
    return removeScheduleItem(tournamentId.value, deleteScheduleMatch[1] ?? "");
  }

  const deleteDayMatch = tournamentRoute.rest.match(/^days\/(\d+)$/);
  if (request.method === "DELETE" && deleteDayMatch) {
    return removeDay(tournamentId.value, Number(deleteDayMatch[1]));
  }

  return methodNotAllowed(request.method);
}

async function createTournament(body: unknown): Promise<ApiResponse> {
  if (!isObject(body)) return badRequest("Request body must be a JSON object.");

  const name = parseString(body.name, "name");
  if ("error" in name) return badRequest(name.error);

  const location = parseOptionalString(body.location);

  const result = await mutateAndReturnData(async (transactionId) => {
    await executeSql(
      `
        insert into tournaments (name, location)
        values (:name, :location)
      `,
      [sqlParam("name", name.value), sqlParam("location", location)],
      transactionId,
    );
  });

  const tournament = [...result.data.tournaments]
    .reverse()
    .find((item) => item.name === name.value && item.location === location);

  return jsonResponse(201, { ...result, tournamentId: tournament?.id ?? null });
}

async function removeTournament(tournamentId: string): Promise<ApiResponse> {
  return jsonResponse(
    200,
    await mutateAndReturnData(async (transactionId) => {
      const games = await executeSql(
        "select id from games where tournament_id = cast(:tournamentId as uuid)",
        [sqlParam("tournamentId", tournamentId)],
        transactionId,
      );

      await executeSql(
        "delete from tournament_schedule_items where tournament_id = cast(:tournamentId as uuid)",
        [sqlParam("tournamentId", tournamentId)],
        transactionId,
      );

      for (const game of games.rows) {
        await deleteGameTree(String(game.id), transactionId);
      }

      await executeSql(
        "delete from tournament_players where tournament_id = cast(:tournamentId as uuid)",
        [sqlParam("tournamentId", tournamentId)],
        transactionId,
      );
      await executeSql(
        "delete from tournaments where id = cast(:tournamentId as uuid)",
        [sqlParam("tournamentId", tournamentId)],
        transactionId,
      );
    }),
  );
}

async function toggleTournamentPlayer(tournamentId: string, body: unknown): Promise<ApiResponse> {
  if (!isObject(body)) return badRequest("Request body must be a JSON object.");

  const playerId = parseUuid(body.playerId, "playerId");
  if ("error" in playerId) return badRequest(playerId.error);

  return jsonResponse(
    200,
    await mutateAndReturnData(async (transactionId) => {
      const existing = await executeSql(
        `
          select id
          from tournament_players
          where tournament_id = cast(:tournamentId as uuid)
            and player_id = cast(:playerId as uuid)
          limit 1
        `,
        [sqlParam("tournamentId", tournamentId), sqlParam("playerId", playerId.value)],
        transactionId,
      );

      if (existing.rows[0]) {
        await executeSql(
          "delete from tournament_players where id = cast(:id as uuid)",
          [sqlParam("id", existing.rows[0].id)],
          transactionId,
        );
        return;
      }

      await executeSql(
        `
          insert into tournament_players (tournament_id, player_id)
          values (cast(:tournamentId as uuid), cast(:playerId as uuid))
          on conflict (tournament_id, player_id) do nothing
        `,
        [sqlParam("tournamentId", tournamentId), sqlParam("playerId", playerId.value)],
        transactionId,
      );
    }),
  );
}

async function selectRosteredTournamentPlayers(tournamentId: string): Promise<ApiResponse> {
  return jsonResponse(
    200,
    await mutateAndReturnData(async (transactionId) => {
      await executeSql(
        "delete from tournament_players where tournament_id = cast(:tournamentId as uuid)",
        [sqlParam("tournamentId", tournamentId)],
        transactionId,
      );
      await executeSql(
        `
          insert into tournament_players (tournament_id, player_id)
          select cast(:tournamentId as uuid), id
          from players
          where roster_player = true
          on conflict (tournament_id, player_id) do nothing
        `,
        [sqlParam("tournamentId", tournamentId)],
        transactionId,
      );
    }),
  );
}

async function createGame(tournamentId: string, body: unknown): Promise<ApiResponse> {
  if (!isObject(body)) return badRequest("Request body must be a JSON object.");

  const opponentName = parseString(body.opponentName, "opponentName");
  if ("error" in opponentName) return badRequest(opponentName.error);

  const dayNumber = parsePositiveInteger(body.dayNumber, "dayNumber");
  if ("error" in dayNumber) return badRequest(dayNumber.error);

  const videoUrl = parseOptionalString(body.videoUrl);
  let gameId: string | null = null;

  const result = await mutateAndReturnData(async (transactionId) => {
    const sortOrder = await nextSortOrder(tournamentId, dayNumber.value, transactionId);
    const game = await executeSql(
      `
        insert into games (tournament_id, opponent_name, video_url)
        values (cast(:tournamentId as uuid), :opponentName, :videoUrl)
        returning id
      `,
      [
        sqlParam("tournamentId", tournamentId),
        sqlParam("opponentName", opponentName.value),
        sqlParam("videoUrl", videoUrl),
      ],
      transactionId,
    );
    gameId = String(game.rows[0]?.id ?? "");

    await executeSql(
      `
        insert into tournament_schedule_items (tournament_id, type, game_id, day_number, sort_order)
        values (
          cast(:tournamentId as uuid),
          'game',
          cast(:gameId as uuid),
          :dayNumber,
          :sortOrder
        )
      `,
      [
        sqlParam("tournamentId", tournamentId),
        sqlParam("gameId", gameId),
        sqlParam("dayNumber", dayNumber.value),
        sqlParam("sortOrder", sortOrder),
      ],
      transactionId,
    );
  });

  return jsonResponse(201, { ...result, gameId });
}

async function createBye(tournamentId: string, body: unknown): Promise<ApiResponse> {
  if (!isObject(body)) return badRequest("Request body must be a JSON object.");

  const dayNumber = parsePositiveInteger(body.dayNumber, "dayNumber");
  if ("error" in dayNumber) return badRequest(dayNumber.error);

  return jsonResponse(
    201,
    await mutateAndReturnData(async (transactionId) => {
      const sortOrder = await nextSortOrder(tournamentId, dayNumber.value, transactionId);
      await executeSql(
        `
          insert into tournament_schedule_items (tournament_id, type, label, day_number, sort_order)
          values (cast(:tournamentId as uuid), 'bye', 'Bye', :dayNumber, :sortOrder)
        `,
        [
          sqlParam("tournamentId", tournamentId),
          sqlParam("dayNumber", dayNumber.value),
          sqlParam("sortOrder", sortOrder),
        ],
        transactionId,
      );
    }),
  );
}

async function updateDayCount(tournamentId: string, body: unknown): Promise<ApiResponse> {
  if (!isObject(body)) return badRequest("Request body must be a JSON object.");

  const dayCount = parsePositiveInteger(body.dayCount, "dayCount");
  if ("error" in dayCount) return badRequest(dayCount.error);

  return jsonResponse(
    200,
    await mutateAndReturnData(async (transactionId) => {
      await executeSql(
        "update tournaments set day_count = :dayCount where id = cast(:tournamentId as uuid)",
        [sqlParam("dayCount", dayCount.value), sqlParam("tournamentId", tournamentId)],
        transactionId,
      );
    }),
  );
}

async function moveScheduleItem(tournamentId: string, scheduleItemId: string, body: unknown): Promise<ApiResponse> {
  const parsedScheduleItemId = parseUuid(scheduleItemId, "scheduleItemId");
  if ("error" in parsedScheduleItemId) return badRequest(parsedScheduleItemId.error);
  if (!isObject(body)) return badRequest("Request body must be a JSON object.");

  const targetDay = parsePositiveInteger(body.targetDay, "targetDay");
  if ("error" in targetDay) return badRequest(targetDay.error);

  const targetIndex = parseInteger(body.targetIndex, "targetIndex");
  if ("error" in targetIndex) return badRequest(targetIndex.error);

  return jsonResponse(
    200,
    await mutateAndReturnData(async (transactionId) => {
      const items = await executeSql(
        `
          select *
          from tournament_schedule_items
          where tournament_id = cast(:tournamentId as uuid)
          order by day_number, sort_order
        `,
        [sqlParam("tournamentId", tournamentId)],
        transactionId,
      );
      const dragged = items.rows.find((item) => item.id === parsedScheduleItemId.value);
      if (!dragged) return;

      const remaining = items.rows.filter((item) => item.id !== parsedScheduleItemId.value);
      const dayItems = remaining.filter((item) => item.day_number === targetDay.value);
      const insertIndex = Math.min(Math.max(targetIndex.value, 0), dayItems.length);
      const reorderedDayItems = [
        ...dayItems.slice(0, insertIndex),
        { ...dragged, day_number: targetDay.value },
        ...dayItems.slice(insertIndex),
      ];
      const dayNumbers = Array.from(
        new Set([...remaining.map((item) => Number(item.day_number)), targetDay.value]),
      ).sort((a, b) => a - b);
      const nextItems = dayNumbers.flatMap((dayNumber) => {
        const orderedDayItems =
          dayNumber === targetDay.value
            ? reorderedDayItems
            : remaining.filter((item) => Number(item.day_number) === dayNumber);

        return orderedDayItems.map((item, sortOrder) => ({
          id: String(item.id),
          dayNumber,
          sortOrder,
        }));
      });

      await executeSql(
        `
          update tournament_schedule_items
          set sort_order = sort_order + 10000
          where tournament_id = cast(:tournamentId as uuid)
        `,
        [sqlParam("tournamentId", tournamentId)],
        transactionId,
      );

      for (const item of nextItems) {
        await executeSql(
          `
            update tournament_schedule_items
            set day_number = :dayNumber, sort_order = :sortOrder
            where id = cast(:id as uuid)
          `,
          [
            sqlParam("dayNumber", item.dayNumber),
            sqlParam("sortOrder", item.sortOrder),
            sqlParam("id", item.id),
          ],
          transactionId,
        );
      }
    }),
  );
}

async function removeScheduleItem(tournamentId: string, scheduleItemId: string): Promise<ApiResponse> {
  const parsedScheduleItemId = parseUuid(scheduleItemId, "scheduleItemId");
  if ("error" in parsedScheduleItemId) return badRequest(parsedScheduleItemId.error);

  return jsonResponse(
    200,
    await mutateAndReturnData(async (transactionId) => {
      const scheduleItem = await executeSql(
        `
          select *
          from tournament_schedule_items
          where id = cast(:scheduleItemId as uuid)
            and tournament_id = cast(:tournamentId as uuid)
          limit 1
        `,
        [sqlParam("scheduleItemId", parsedScheduleItemId.value), sqlParam("tournamentId", tournamentId)],
        transactionId,
      );
      const item = scheduleItem.rows[0];
      if (!item) return;

      await executeSql(
        "delete from tournament_schedule_items where id = cast(:scheduleItemId as uuid)",
        [sqlParam("scheduleItemId", parsedScheduleItemId.value)],
        transactionId,
      );

      if (item.game_id) {
        await deleteGameTree(String(item.game_id), transactionId);
      }
    }),
  );
}

async function removeDay(tournamentId: string, dayNumber: number): Promise<ApiResponse> {
  if (!Number.isInteger(dayNumber) || dayNumber <= 0) {
    return badRequest("dayNumber must be a positive integer.");
  }

  return jsonResponse(
    200,
    await mutateAndReturnData(async (transactionId) => {
      const dayItems = await executeSql(
        `
          select id
          from tournament_schedule_items
          where tournament_id = cast(:tournamentId as uuid)
            and day_number = :dayNumber
          limit 1
        `,
        [sqlParam("tournamentId", tournamentId), sqlParam("dayNumber", dayNumber)],
        transactionId,
      );
      if (dayItems.rows[0]) return;

      await executeSql(
        `
          update tournaments
          set day_count = greatest(1, day_count - 1)
          where id = cast(:tournamentId as uuid)
            and day_count > 1
        `,
        [sqlParam("tournamentId", tournamentId)],
        transactionId,
      );
      await executeSql(
        `
          update tournament_schedule_items
          set day_number = day_number - 1
          where tournament_id = cast(:tournamentId as uuid)
            and day_number > :dayNumber
        `,
        [sqlParam("tournamentId", tournamentId), sqlParam("dayNumber", dayNumber)],
        transactionId,
      );
    }),
  );
}

async function nextSortOrder(tournamentId: string, dayNumber: number, transactionId: string): Promise<number> {
  const result = await executeSql(
    `
      select coalesce(max(sort_order), -1) + 1 as next_sort_order
      from tournament_schedule_items
      where tournament_id = cast(:tournamentId as uuid)
        and day_number = :dayNumber
    `,
    [sqlParam("tournamentId", tournamentId), sqlParam("dayNumber", dayNumber)],
    transactionId,
  );

  return Number(result.rows[0]?.next_sort_order ?? 0);
}

async function deleteGameTree(gameId: string, transactionId: string): Promise<void> {
  const points = await executeSql(
    "select id from points where game_id = cast(:gameId as uuid)",
    [sqlParam("gameId", gameId)],
    transactionId,
  );

  for (const point of points.rows) {
    await executeSql(
      "delete from point_players where point_id = cast(:pointId as uuid)",
      [sqlParam("pointId", point.id)],
      transactionId,
    );
  }

  await executeSql(
    "delete from events where game_id = cast(:gameId as uuid)",
    [sqlParam("gameId", gameId)],
    transactionId,
  );
  await executeSql(
    "delete from points where game_id = cast(:gameId as uuid)",
    [sqlParam("gameId", gameId)],
    transactionId,
  );
  await executeSql("delete from games where id = cast(:gameId as uuid)", [sqlParam("gameId", gameId)], transactionId);
}

function parseTournamentRoute(path: string) {
  const match = path.match(/^\/api\/tournaments\/([^/]+)\/?(.*)$/);
  if (!match) return null;

  return {
    tournamentId: decodeURIComponent(match[1] ?? ""),
    rest: match[2] ?? "",
  };
}

function parsePositiveInteger(value: unknown, label: string) {
  const parsed = parseInteger(value, label);
  if ("error" in parsed) return parsed;
  if (parsed.value <= 0) return { error: `${label} must be positive.` };
  return parsed;
}
