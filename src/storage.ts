import type { AppData, Event, Game, Player } from "./types";

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
  return {
    ...game,
    activeThrowerId: game.activeThrowerId ?? null,
    discX: game.discX ?? null,
    discY: game.discY ?? null,
  };
}

function normalizeEvent(event: Event): Event {
  return {
    ...event,
    startX: event.startX ?? null,
    startY: event.startY ?? null,
    endX: event.endX ?? null,
    endY: event.endY ?? null,
  };
}
