import type { AppData, Event, Game, Player, Point } from "./types";

const STORAGE_KEY = "colt-tracker-poc";

export const emptyData = (): AppData => ({
  players: [],
  tournaments: [],
  tournamentPlayers: [],
  games: [],
  points: [],
  pointPlayers: [],
  events: [],
});

export function loadData(): AppData {
  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return emptyData();
  }

  try {
    const parsed = { ...emptyData(), ...JSON.parse(raw) } as AppData;
    return {
      ...parsed,
      players: parsed.players.map(normalizePlayer),
      games: parsed.games.map(normalizeGame),
      points: parsed.points.map(normalizePoint),
      events: parsed.events.map(normalizeEvent),
    };
  } catch {
    return emptyData();
  }
}

export function saveData(data: AppData) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function normalizePlayer(player: Player): Player {
  return {
    ...player,
    rosterPlayer: player.rosterPlayer ?? true,
  };
}

function normalizeGame(game: Game): Game {
  const hasStartingPossession = Object.prototype.hasOwnProperty.call(game, "startingPossession");
  const hasStartingEndzone = Object.prototype.hasOwnProperty.call(game, "startingEndzone");
  const hasSecondHalfStarted = Object.prototype.hasOwnProperty.call(game, "secondHalfStarted");
  const hasGameFinished = Object.prototype.hasOwnProperty.call(game, "gameFinished");

  return {
    ...game,
    startingPossession: hasStartingPossession ? game.startingPossession : game.currentPossession,
    startingEndzone: hasStartingEndzone ? game.startingEndzone : "left",
    secondHalfStarted: hasSecondHalfStarted ? Boolean(game.secondHalfStarted) : false,
    gameFinished: hasGameFinished ? Boolean(game.gameFinished) : false,
    activeThrowerId: game.activeThrowerId ?? null,
    discX: game.discX ?? null,
    discY: game.discY ?? null,
  };
}

function normalizePoint(point: Point): Point {
  return {
    ...point,
    initialThrowerId: point.initialThrowerId ?? null,
    initialDiscX: point.initialDiscX ?? null,
    initialDiscY: point.initialDiscY ?? null,
  };
}

function normalizeEvent(event: Event): Event {
  return {
    ...event,
    pointId: event.pointId ?? null,
    half: event.half ?? 1,
    startX: event.startX ?? null,
    startY: event.startY ?? null,
    endX: event.endX ?? null,
    endY: event.endY ?? null,
  };
}
