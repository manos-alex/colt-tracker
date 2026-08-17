import type { AppData, Id } from "./types";

export function createEmptyData(): AppData {
  return {
    players: [],
    tournaments: [],
    tournamentPlayers: [],
    tournamentScheduleItems: [],
    games: [],
    points: [],
    pointPlayers: [],
    events: [],
  };
}

export function mergeTournamentData(
  current: AppData,
  incoming: AppData,
  tournamentId: Id,
): AppData {
  const currentTournamentGameIds = new Set(
    current.games.filter((game) => game.tournamentId === tournamentId).map((game) => game.id),
  );
  const incomingGameIds = new Set(incoming.games.map((game) => game.id));
  const removedGameIds = new Set(
    [...currentTournamentGameIds].filter((gameId) => !incomingGameIds.has(gameId)),
  );
  const removedPointIds = new Set(
    current.points.filter((point) => removedGameIds.has(point.gameId)).map((point) => point.id),
  );

  return {
    players: incoming.players,
    tournaments: replaceWhere(
      current.tournaments,
      incoming.tournaments,
      (item) => item.id === tournamentId,
    ),
    tournamentPlayers: replaceWhere(
      current.tournamentPlayers,
      incoming.tournamentPlayers,
      (item) => item.tournamentId === tournamentId,
    ),
    tournamentScheduleItems: replaceWhere(
      current.tournamentScheduleItems,
      incoming.tournamentScheduleItems,
      (item) => item.tournamentId === tournamentId,
    ),
    games: replaceWhere(
      current.games,
      incoming.games,
      (item) => item.tournamentId === tournamentId,
    ),
    points: current.points.filter((point) => !removedGameIds.has(point.gameId)),
    pointPlayers: current.pointPlayers.filter((item) => !removedPointIds.has(item.pointId)),
    events: current.events.filter((event) => !removedGameIds.has(event.gameId)),
  };
}

export function mergeGameData(current: AppData, incoming: AppData, gameId: Id): AppData {
  const incomingGame = incoming.games[0];
  const tournamentId = incomingGame?.tournamentId;
  const currentPointIds = new Set(
    current.points.filter((point) => point.gameId === gameId).map((point) => point.id),
  );

  return {
    players: mergeById(current.players, incoming.players),
    tournaments: mergeById(current.tournaments, incoming.tournaments),
    tournamentPlayers: tournamentId
      ? replaceWhere(
          current.tournamentPlayers,
          incoming.tournamentPlayers,
          (item) => item.tournamentId === tournamentId,
        )
      : current.tournamentPlayers,
    tournamentScheduleItems: current.tournamentScheduleItems,
    games: mergeById(current.games, incoming.games),
    points: replaceWhere(current.points, incoming.points, (point) => point.gameId === gameId),
    pointPlayers: replaceWhere(
      current.pointPlayers,
      incoming.pointPlayers,
      (item) => currentPointIds.has(item.pointId),
    ),
    events: replaceWhere(current.events, incoming.events, (event) => event.gameId === gameId),
  };
}

function mergeById<T extends { id: Id }>(current: T[], incoming: T[]) {
  const incomingIds = new Set(incoming.map((item) => item.id));
  return [...current.filter((item) => !incomingIds.has(item.id)), ...incoming];
}

function replaceWhere<T>(current: T[], incoming: T[], matchesScope: (item: T) => boolean) {
  return [...current.filter((item) => !matchesScope(item)), ...incoming];
}
