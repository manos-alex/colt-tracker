import type { AppData } from "./types";

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
