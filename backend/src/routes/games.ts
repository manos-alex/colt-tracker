import type { AppData, Event, FieldCoordinate, Game, Id, Point, Possession } from "../../../src/types.js";
import { executeSql, sqlParam } from "../db/dataApi.js";
import { badRequest, jsonResponse, methodNotAllowed, type ApiRequest, type ApiResponse } from "../http.js";
import { getBootstrapData } from "./bootstrap.js";
import {
  insertEvent,
  isObject,
  mutateAndReturnData,
  parseBoolean,
  parseCoordinate,
  parseEventType,
  parseInteger,
  parseNumber,
  parseOptionalCoordinate,
  parseOptionalUuid,
  parsePossession,
  parseUuid,
  updateGamePatch,
} from "./shared.js";

const oppositePossession = (possession: Possession): Possession =>
  possession === "us" ? "opponent" : "us";
const oppositeEndzone = (endzone: "left" | "right") => (endzone === "left" ? "right" : "left");
const isGoalSpot = (spot: FieldCoordinate, attackingEndzone: "left" | "right") =>
  attackingEndzone === "right" ? spot.x >= 90 / 110 : spot.x <= 20 / 110;
const pointStartingEndzone = (startingEndzone: "left" | "right", pointNumber: number) =>
  pointNumber % 2 === 1 ? startingEndzone : oppositeEndzone(startingEndzone);
const pointAttackingEndzone = (startingEndzone: "left" | "right", pointNumber: number) =>
  oppositeEndzone(pointStartingEndzone(startingEndzone, pointNumber));

export async function handleGamesRequest(request: ApiRequest): Promise<ApiResponse> {
  const route = parseGameRoute(request.path);
  if (!route) return badRequest("Game route is invalid.");

  const gameId = parseUuid(route.gameId, "gameId");
  if ("error" in gameId) return badRequest(gameId.error);

  if (request.method === "PATCH" && route.rest === "") {
    return patchGame(gameId.value, request.body);
  }

  if (request.method === "POST" && route.rest === "start-point") {
    return startPoint(gameId.value, request.body);
  }

  if (request.method === "POST" && route.rest === "events") {
    return recordEvent(gameId.value, request.body);
  }

  if (request.method === "POST" && route.rest === "finish-point") {
    return finishPoint(gameId.value, request.body);
  }

  if (request.method === "DELETE" && route.rest === "active-point") {
    return deleteActivePointStart(gameId.value);
  }

  const deleteEventMatch = route.rest.match(/^events\/([^/]+)$/);
  if (request.method === "DELETE" && deleteEventMatch) {
    return deleteEvent(gameId.value, deleteEventMatch[1] ?? "");
  }

  return methodNotAllowed(request.method);
}

async function patchGame(gameId: Id, body: unknown): Promise<ApiResponse> {
  if (!isObject(body) || !isObject(body.patch)) {
    return badRequest("patch is required.");
  }

  const patch = parseGamePatch(body.patch);
  if ("error" in patch) return badRequest(patch.error);

  return jsonResponse(
    200,
    await mutateAndReturnData(async (transactionId) => {
      await updateGamePatch(gameId, patch.value, transactionId);
    }),
  );
}

async function startPoint(gameId: Id, body: unknown): Promise<ApiResponse> {
  if (!isObject(body)) return badRequest("Request body must be a JSON object.");

  const starterIds = parseStarterIds(body.starterIds);
  if ("error" in starterIds) return badRequest(starterIds.error);

  const startedOnOffense = parseBoolean(body.startedOnOffense, "startedOnOffense");
  if ("error" in startedOnOffense) return badRequest(startedOnOffense.error);

  const initialThrowerId = parseOptionalUuid(body.initialThrowerId, "initialThrowerId");
  if ("error" in initialThrowerId) return badRequest(initialThrowerId.error);

  const initialSpot = parseCoordinate(body.initialSpot, "initialSpot");
  if ("error" in initialSpot) return badRequest(initialSpot.error);

  const initialCatchVideoSeconds =
    body.initialCatchVideoSeconds === undefined || body.initialCatchVideoSeconds === null
      ? { value: 0 }
      : parseInteger(body.initialCatchVideoSeconds, "initialCatchVideoSeconds");
  if ("error" in initialCatchVideoSeconds) return badRequest(initialCatchVideoSeconds.error);

  let pullDetails: null | {
    pullerId: Id;
    hangTimeSeconds: number;
    landingSpot: FieldCoordinate;
    inBounds: boolean;
    releaseVideoSeconds: number;
  } = null;

  if (body.pullDetails !== undefined && body.pullDetails !== null) {
    if (!isObject(body.pullDetails)) return badRequest("pullDetails must be an object.");
    const pullerId = parseUuid(body.pullDetails.pullerId, "pullerId");
    if ("error" in pullerId) return badRequest(pullerId.error);
    const hangTimeSeconds = parseNumber(body.pullDetails.hangTimeSeconds, "hangTimeSeconds");
    if ("error" in hangTimeSeconds) return badRequest(hangTimeSeconds.error);
    const landingSpot = parseCoordinate(body.pullDetails.landingSpot, "landingSpot");
    if ("error" in landingSpot) return badRequest(landingSpot.error);
    const inBounds = parseBoolean(body.pullDetails.inBounds, "inBounds");
    if ("error" in inBounds) return badRequest(inBounds.error);
    const releaseVideoSeconds = parseInteger(body.pullDetails.releaseVideoSeconds, "releaseVideoSeconds");
    if ("error" in releaseVideoSeconds) return badRequest(releaseVideoSeconds.error);

    pullDetails = {
      pullerId: pullerId.value,
      hangTimeSeconds: hangTimeSeconds.value,
      landingSpot: landingSpot.value,
      inBounds: inBounds.value,
      releaseVideoSeconds: releaseVideoSeconds.value,
    };
  }

  const pointStartEventVideoSeconds =
    startedOnOffense.value && initialThrowerId.value
      ? initialCatchVideoSeconds.value
      : pullDetails?.releaseVideoSeconds ?? null;
  if (pointStartEventVideoSeconds !== null) {
    const timelineError = await validateEventTimestamp(gameId, pointStartEventVideoSeconds);
    if (timelineError) return timelineError;
  }

  return jsonResponse(
    200,
    await mutateAndReturnData(async (transactionId) => {
      const game = await requireGame(gameId, transactionId);
      const pointNumber = Number(game.our_score) + Number(game.opponent_score) + 1;
      const point = await executeSql(
        `
          insert into points (
            game_id,
            point_number,
            started_on_offense,
            our_score_start,
            opponent_score_start,
            initial_thrower_id,
            initial_disc_x,
            initial_disc_y
          )
          values (
            cast(:gameId as uuid),
            :pointNumber,
            :startedOnOffense,
            :ourScoreStart,
            :opponentScoreStart,
            cast(:initialThrowerId as uuid),
            :initialDiscX,
            :initialDiscY
          )
          returning id
        `,
        [
          sqlParam("gameId", gameId),
          sqlParam("pointNumber", pointNumber),
          sqlParam("startedOnOffense", startedOnOffense.value),
          sqlParam("ourScoreStart", game.our_score),
          sqlParam("opponentScoreStart", game.opponent_score),
          sqlParam("initialThrowerId", startedOnOffense.value ? initialThrowerId.value : null),
          sqlParam("initialDiscX", startedOnOffense.value ? initialSpot.value.x : null),
          sqlParam("initialDiscY", startedOnOffense.value ? initialSpot.value.y : null),
        ],
        transactionId,
      );
      const pointId = String(point.rows[0]?.id ?? "");

      for (const playerId of starterIds.value) {
        await executeSql(
          `
            insert into point_players (point_id, player_id, is_starter)
            values (cast(:pointId as uuid), cast(:playerId as uuid), true)
          `,
          [sqlParam("pointId", pointId), sqlParam("playerId", playerId)],
          transactionId,
        );
      }

      if (startedOnOffense.value && initialThrowerId.value) {
        await insertEvent(
          {
            gameId,
            pointId,
            eventType: "catch",
            half: game.second_half_started ? 2 : 1,
            playerId: initialThrowerId.value,
            end: initialSpot.value,
            fromPull: true,
            videoSeconds: initialCatchVideoSeconds.value,
          },
          transactionId,
        );
      }

      if (pullDetails) {
        await insertEvent(
          {
            gameId,
            pointId,
            eventType: "pull",
            half: game.second_half_started ? 2 : 1,
            playerId: pullDetails.pullerId,
            end: pullDetails.landingSpot,
            pullHangTimeSeconds: pullDetails.hangTimeSeconds,
            pullInBounds: pullDetails.inBounds,
            videoSeconds: pullDetails.releaseVideoSeconds,
          },
          transactionId,
        );
      }

      await updateGamePatch(
        gameId,
        {
          currentPossession: startedOnOffense.value ? "us" : "opponent",
          activeThrowerId: startedOnOffense.value ? initialThrowerId.value : null,
          discX: startedOnOffense.value ? initialSpot.value.x : null,
          discY: startedOnOffense.value ? initialSpot.value.y : null,
        },
        transactionId,
      );
    }),
  );
}

async function recordEvent(gameId: Id, body: unknown): Promise<ApiResponse> {
  if (!isObject(body)) return badRequest("Request body must be a JSON object.");

  const parsed = parseEventBody(body);
  if ("error" in parsed) return badRequest(parsed.error);

  const gamePatch = body.gamePatch === undefined ? { value: {} } : parseGamePatch(body.gamePatch);
  if ("error" in gamePatch) return badRequest(gamePatch.error);

  const subPlayerId = parseOptionalUuid(body.subPlayerId, "subPlayerId");
  if ("error" in subPlayerId) return badRequest(subPlayerId.error);

  const timelineError = await validateEventTimestamp(gameId, parsed.value.videoSeconds);
  if (timelineError) return timelineError;

  return jsonResponse(
    200,
    await mutateAndReturnData(async (transactionId) => {
      const game = await requireGame(gameId, transactionId);
      const activePoint = await getActivePoint(gameId, transactionId);

      await insertEvent(
        {
          ...parsed.value,
          gameId,
          pointId: parsed.value.eventType === "half_time" || parsed.value.eventType === "full_time"
            ? null
            : activePoint?.id
              ? String(activePoint.id)
              : null,
          half: parsed.value.eventType === "half_time" ? 1 : game.second_half_started ? 2 : 1,
        },
        transactionId,
      );

      if (subPlayerId.value && activePoint?.id) {
        await executeSql(
          `
            insert into point_players (point_id, player_id, is_starter)
            values (cast(:pointId as uuid), cast(:playerId as uuid), false)
            on conflict (point_id, player_id) do nothing
          `,
          [sqlParam("pointId", activePoint.id), sqlParam("playerId", subPlayerId.value)],
          transactionId,
        );
      }

      await updateGamePatch(gameId, gamePatch.value, transactionId);
    }),
  );
}

async function finishPoint(gameId: Id, body: unknown): Promise<ApiResponse> {
  if (!isObject(body)) return badRequest("Request body must be a JSON object.");

  const scoringTeam = parsePossession(body.scoringTeam, "scoringTeam");
  if ("error" in scoringTeam) return badRequest(scoringTeam.error);

  const eventInput =
    body.eventType === undefined || body.eventType === null ? null : parseEventBody(body);
  if (eventInput && "error" in eventInput) return badRequest(eventInput.error);

  if (eventInput) {
    const timelineError = await validateEventTimestamp(gameId, eventInput.value.videoSeconds);
    if (timelineError) return timelineError;
  }

  return jsonResponse(
    200,
    await mutateAndReturnData(async (transactionId) => {
      const game = await requireGame(gameId, transactionId);
      const activePoint = await getActivePoint(gameId, transactionId);
      if (!activePoint?.id) return;

      const ourScore = Number(game.our_score) + (scoringTeam.value === "us" ? 1 : 0);
      const opponentScore = Number(game.opponent_score) + (scoringTeam.value === "opponent" ? 1 : 0);

      if (eventInput && !("error" in eventInput)) {
        await insertEvent(
          {
            ...eventInput.value,
            gameId,
            pointId: String(activePoint.id),
            half: game.second_half_started ? 2 : 1,
          },
          transactionId,
        );
      }

      await executeSql(
        `
          update points
          set
            our_score_end = :ourScore,
            opponent_score_end = :opponentScore,
            scoring_team = :scoringTeam,
            status = 'complete'
          where id = cast(:pointId as uuid)
        `,
        [
          sqlParam("ourScore", ourScore),
          sqlParam("opponentScore", opponentScore),
          sqlParam("scoringTeam", scoringTeam.value),
          sqlParam("pointId", activePoint.id),
        ],
        transactionId,
      );

      await updateGamePatch(
        gameId,
        {
          ourScore,
          opponentScore,
          currentPossession: scoringTeam.value === "us" ? "opponent" : "us",
          activeThrowerId: null,
          discX: null,
          discY: null,
        },
        transactionId,
      );
    }),
  );
}

async function validateEventTimestamp(
  gameId: Id,
  eventVideoSeconds: number,
): Promise<ApiResponse | null> {
  const latestEvent = await executeSql<{ video_seconds: number }>(
    `
      select video_seconds
      from events
      where game_id = cast(:gameId as uuid)
      order by video_seconds desc, created_at desc
      limit 1
    `,
    [sqlParam("gameId", gameId)],
  );
  const latestVideoSeconds = Number(latestEvent.rows[0]?.video_seconds);

  if (!Number.isFinite(latestVideoSeconds) || eventVideoSeconds >= latestVideoSeconds) {
    return null;
  }

  return badRequest(
    `Event timestamp cannot be earlier than the latest event timestamp (${latestVideoSeconds} seconds).`,
  );
}

async function deleteActivePointStart(gameId: Id): Promise<ApiResponse> {
  const data = await getBootstrapData();
  const activePoint = data.points.find((point) => point.gameId === gameId && point.status === "active");
  if (!activePoint) {
    return jsonResponse(200, { data });
  }

  const pointEvents = data.events.filter((event) => event.pointId === activePoint.id);
  if (
    pointEvents.some(
      (event) => event.eventType !== "pull" && !(event.eventType === "catch" && event.fromPull),
    )
  ) {
    return badRequest("Only a point with no charted events can be undone from point start.");
  }

  return jsonResponse(
    200,
    await mutateAndReturnData(async (transactionId) => {
      const currentActivePoint = await getActivePoint(gameId, transactionId);
      if (!currentActivePoint?.id) return;

      const currentPointEvents = await executeSql(
        `
          select event_type, payload
          from events
          where point_id = cast(:pointId as uuid)
          order by video_seconds, created_at
        `,
        [sqlParam("pointId", currentActivePoint.id)],
        transactionId,
      );
      const hasChartedEvents = currentPointEvents.rows.some((event) => {
        const payload = parsePayload(event.payload);
        return event.event_type !== "pull" && !(event.event_type === "catch" && payload.fromPull === true);
      });
      if (hasChartedEvents) return;

      await executeSql(
        "delete from events where point_id = cast(:pointId as uuid)",
        [sqlParam("pointId", currentActivePoint.id)],
        transactionId,
      );
      await executeSql(
        "delete from point_players where point_id = cast(:pointId as uuid)",
        [sqlParam("pointId", currentActivePoint.id)],
        transactionId,
      );
      await executeSql(
        "delete from points where id = cast(:pointId as uuid)",
        [sqlParam("pointId", currentActivePoint.id)],
        transactionId,
      );
      await updateGamePatch(
        gameId,
        {
          currentPossession: currentActivePoint.started_on_offense ? "us" : "opponent",
          activeThrowerId: null,
          discX: null,
          discY: null,
          gameFinished: false,
        },
        transactionId,
      );
    }),
  );
}

async function deleteEvent(gameId: Id, eventId: string): Promise<ApiResponse> {
  const parsedEventId = parseUuid(eventId, "eventId");
  if ("error" in parsedEventId) return badRequest(parsedEventId.error);

  return jsonResponse(
    200,
    await mutateAndReturnData(async (transactionId) => {
      const data = await getBootstrapData();
      const targetEvent = data.events.find((event) => event.id === parsedEventId.value && event.gameId === gameId);
      const currentGame = data.games.find((game) => game.id === gameId);
      if (!targetEvent || !currentGame) return;

      const nextEvents = data.events.filter((event) => event.id !== parsedEventId.value);
      let nextPoints = data.points;
      let gamePatch: Partial<Game> = {};

      if (targetEvent.eventType === "injury" && targetEvent.pointId && targetEvent.secondaryPlayerId) {
        await executeSql(
          `
            delete from point_players
            where point_id = cast(:pointId as uuid)
              and player_id = cast(:playerId as uuid)
              and is_starter = false
          `,
          [sqlParam("pointId", targetEvent.pointId), sqlParam("playerId", targetEvent.secondaryPlayerId)],
          transactionId,
        );
      }

      if (targetEvent.eventType === "full_time") {
        gamePatch = { ...gamePatch, gameFinished: false };
      }

      if (targetEvent.eventType === "half_time") {
        gamePatch = {
          ...gamePatch,
          secondHalfStarted: false,
          currentPossession: currentGame.startingPossession ?? currentGame.currentPossession,
          activeThrowerId: null,
          discX: null,
          discY: null,
        };
      }

      const targetPoint = data.points.find((point) => point.id === targetEvent.pointId);
      const targetIsScoreEvent = Boolean(
        targetPoint && isPointScoreEvent(targetEvent, targetPoint, currentGame),
      );
      const emptyActivePoint = targetPoint
        ? nextPoints.find(
            (point) =>
              targetIsScoreEvent &&
              point.gameId === gameId &&
              point.status === "active" &&
              point.pointNumber > targetPoint.pointNumber &&
              !nextEvents.some((event) => event.pointId === point.id),
          )
        : undefined;

      if (emptyActivePoint) {
        await executeSql(
          "delete from point_players where point_id = cast(:pointId as uuid)",
          [sqlParam("pointId", emptyActivePoint.id)],
          transactionId,
        );
        await executeSql(
          "delete from points where id = cast(:pointId as uuid)",
          [sqlParam("pointId", emptyActivePoint.id)],
          transactionId,
        );
        nextPoints = nextPoints.filter((point) => point.id !== emptyActivePoint.id);
      }

      const hasLaterPoint = targetPoint
        ? nextPoints.some((point) => point.gameId === gameId && point.pointNumber > targetPoint.pointNumber)
        : false;

      if (targetPoint && targetIsScoreEvent && !hasLaterPoint) {
        await executeSql(
          `
            update points
            set
              our_score_end = null,
              opponent_score_end = null,
              scoring_team = null,
              status = 'active'
            where id = cast(:pointId as uuid)
          `,
          [sqlParam("pointId", targetPoint.id)],
          transactionId,
        );
        gamePatch = {
          ...gamePatch,
          ourScore: targetPoint.ourScoreStart,
          opponentScore: targetPoint.opponentScoreStart,
          gameFinished: false,
        };
        nextPoints = nextPoints.map((point) =>
          point.id === targetPoint.id
            ? {
                ...point,
                ourScoreEnd: null,
                opponentScoreEnd: null,
                scoringTeam: null,
                status: "active",
              }
            : point,
        );
      }

      await executeSql(
        "delete from events where id = cast(:eventId as uuid)",
        [sqlParam("eventId", parsedEventId.value)],
        transactionId,
      );

      const nextActivePoint = nextPoints.find((point) => point.gameId === gameId && point.status === "active");
      if (nextActivePoint) {
        gamePatch = {
          ...gamePatch,
          ...rebuildActiveGameState({ ...currentGame, ...gamePatch }, nextActivePoint, nextEvents),
        };
      }

      await updateGamePatch(gameId, gamePatch, transactionId);
    }),
  );
}

function parseEventBody(body: Record<string, unknown>) {
  const eventType = parseEventType(body.eventType);
  if ("error" in eventType) return eventType;

  const playerId = parseOptionalUuid(body.playerId, "playerId");
  if ("error" in playerId) return playerId;

  const secondaryPlayerId = parseOptionalUuid(body.secondaryPlayerId, "secondaryPlayerId");
  if ("error" in secondaryPlayerId) return secondaryPlayerId;

  const start = parseOptionalCoordinate(body.start, "start");
  if ("error" in start) return start;

  const end = parseOptionalCoordinate(body.end, "end");
  if ("error" in end) return end;

  const videoSeconds = parseInteger(body.videoSeconds, "videoSeconds");
  if ("error" in videoSeconds) return videoSeconds;

  const pullHangTimeSeconds =
    body.pullHangTimeSeconds === undefined || body.pullHangTimeSeconds === null
      ? { value: null }
      : parseNumber(body.pullHangTimeSeconds, "pullHangTimeSeconds");
  if ("error" in pullHangTimeSeconds) return pullHangTimeSeconds;

  const pullInBounds =
    body.pullInBounds === undefined || body.pullInBounds === null
      ? { value: null }
      : parseBoolean(body.pullInBounds, "pullInBounds");
  if ("error" in pullInBounds) return pullInBounds;

  const fromPull =
    body.fromPull === undefined || body.fromPull === null
      ? { value: null }
      : parseBoolean(body.fromPull, "fromPull");
  if ("error" in fromPull) return fromPull;

  return {
    value: {
      eventType: eventType.value,
      playerId: playerId.value,
      secondaryPlayerId: secondaryPlayerId.value,
      start: start.value,
      end: end.value,
      pullHangTimeSeconds: pullHangTimeSeconds.value,
      pullInBounds: pullInBounds.value,
      fromPull: fromPull.value,
      videoSeconds: videoSeconds.value,
    },
  };
}

function parseGamePatch(value: unknown): { value: Partial<Game> } | { error: string } {
  if (!isObject(value)) return { error: "game patch must be an object." };

  const patch: Partial<Game> = {};

  if (value.currentPossession !== undefined) {
    const parsed = parsePossession(value.currentPossession, "currentPossession");
    if ("error" in parsed) return parsed;
    patch.currentPossession = parsed.value;
  }
  if (value.startingPossession !== undefined) {
    const parsed = parsePossession(value.startingPossession, "startingPossession");
    if ("error" in parsed) return parsed;
    patch.startingPossession = parsed.value;
  }
  if (value.startingEndzone !== undefined) {
    if (value.startingEndzone !== "left" && value.startingEndzone !== "right") {
      return { error: "startingEndzone must be left or right." };
    }
    patch.startingEndzone = value.startingEndzone;
  }
  if (value.secondHalfStarted !== undefined) {
    const parsed = parseBoolean(value.secondHalfStarted, "secondHalfStarted");
    if ("error" in parsed) return parsed;
    patch.secondHalfStarted = parsed.value;
  }
  if (value.gameFinished !== undefined) {
    const parsed = parseBoolean(value.gameFinished, "gameFinished");
    if ("error" in parsed) return parsed;
    patch.gameFinished = parsed.value;
  }
  if (value.activeThrowerId !== undefined) {
    const parsed = parseOptionalUuid(value.activeThrowerId, "activeThrowerId");
    if ("error" in parsed) return parsed;
    patch.activeThrowerId = parsed.value;
  }
  if (value.discX !== undefined) {
    const parsed = value.discX === null ? { value: null } : parseNumber(value.discX, "discX");
    if ("error" in parsed) return parsed;
    patch.discX = parsed.value;
  }
  if (value.discY !== undefined) {
    const parsed = value.discY === null ? { value: null } : parseNumber(value.discY, "discY");
    if ("error" in parsed) return parsed;
    patch.discY = parsed.value;
  }

  return { value: patch };
}

function parseStarterIds(value: unknown): { value: Id[] } | { error: string } {
  if (!Array.isArray(value) || value.length !== 7) {
    return { error: "starterIds must contain exactly seven player ids." };
  }

  const ids: Id[] = [];
  for (const item of value) {
    const parsed = parseUuid(item, "starterId");
    if ("error" in parsed) return parsed;
    ids.push(parsed.value);
  }

  return { value: ids };
}

async function requireGame(gameId: Id, transactionId: string) {
  const result = await executeSql(
    "select * from games where id = cast(:gameId as uuid) limit 1",
    [sqlParam("gameId", gameId)],
    transactionId,
  );

  return result.rows[0] ?? {};
}

async function getActivePoint(gameId: Id, transactionId: string) {
  const result = await executeSql(
    `
      select *
      from points
      where game_id = cast(:gameId as uuid)
        and status = 'active'
      order by point_number desc
      limit 1
    `,
    [sqlParam("gameId", gameId)],
    transactionId,
  );

  return result.rows[0];
}

function rebuildActiveGameState(game: Game, activePoint: Point, events: Event[]): Partial<Game> {
  let currentPossession: Possession = activePoint.startedOnOffense ? "us" : "opponent";
  let activeThrowerId = activePoint.startedOnOffense ? activePoint.initialThrowerId : null;
  let discX = activePoint.startedOnOffense ? activePoint.initialDiscX : null;
  let discY = activePoint.startedOnOffense ? activePoint.initialDiscY : null;

  events
    .filter((event) => event.pointId === activePoint.id)
    .sort(compareEventsAscending)
    .forEach((event) => {
      if (event.eventType === "pass" || event.eventType === "catch") {
        currentPossession = "us";
        activeThrowerId = event.eventType === "catch" ? event.playerId : event.secondaryPlayerId;
        discX = event.endX;
        discY = event.endY;
      }

      if (
        event.eventType === "throwaway" ||
        event.eventType === "drop" ||
        event.eventType === "opponent_block"
      ) {
        currentPossession = "opponent";
        activeThrowerId = null;
        discX = null;
        discY = null;
      }

      if (event.eventType === "opponent_turnover" || event.eventType === "block") {
        currentPossession = "us";
        activeThrowerId = null;
        discX = null;
        discY = null;
      }

      if (event.eventType === "pickup") {
        currentPossession = "us";
        activeThrowerId = event.playerId;
        discX = event.endX;
        discY = event.endY;
      }
    });

  return {
    ...game,
    currentPossession,
    activeThrowerId,
    discX,
    discY,
  };
}

function isPointScoreEvent(event: Event, point: Point | undefined, game: Game) {
  return (
    event.eventType === "opponent_score" ||
    event.eventType === "callahan" ||
    isScoringPassEvent(event, point, game)
  );
}

function isScoringPassEvent(event: Event, point: Point | undefined, game: Game) {
  if (
    event.eventType !== "pass" ||
    !point ||
    point.scoringTeam !== "us" ||
    point.status !== "complete" ||
    event.endX === null ||
    event.endY === null
  ) {
    return false;
  }

  const attackingEndzone = game.startingEndzone
    ? pointAttackingEndzone(game.startingEndzone, point.pointNumber)
    : "right";

  return isGoalSpot({ x: event.endX, y: event.endY }, attackingEndzone);
}

const compareEventsAscending = (a: Event, b: Event) =>
  a.videoSeconds - b.videoSeconds || a.createdAt.localeCompare(b.createdAt);

function parseGameRoute(path: string) {
  const match = path.match(/^\/api\/games\/([^/]+)\/?(.*)$/);
  if (!match) return null;

  return {
    gameId: decodeURIComponent(match[1] ?? ""),
    rest: match[2] ?? "",
  };
}

function parsePayload(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}
