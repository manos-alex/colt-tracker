import type { AppData } from "../../../src/types.js";
import { executeSql } from "../db/dataApi.js";
import {
  mapEvent,
  mapGame,
  mapPlayer,
  mapPoint,
  mapPointPlayer,
  mapTournament,
  mapTournamentPlayer,
  mapTournamentScheduleItem,
} from "../db/mappers.js";

export async function getBootstrapData(): Promise<AppData> {
  const [
    players,
    tournaments,
    tournamentPlayers,
    tournamentScheduleItems,
    games,
    points,
    pointPlayers,
    events,
  ] = await Promise.all([
    executeSql("select * from players order by name, created_at"),
    executeSql("select * from tournaments order by created_at, name"),
    executeSql("select * from tournament_players order by created_at"),
    executeSql(
      "select * from tournament_schedule_items order by tournament_id, day_number, sort_order, created_at",
    ),
    executeSql("select * from games order by created_at"),
    executeSql("select * from points order by game_id, point_number"),
    executeSql("select * from point_players order by created_at"),
    executeSql("select * from events order by game_id, video_seconds, created_at"),
  ]);

  return {
    players: players.rows.map(mapPlayer),
    tournaments: tournaments.rows.map(mapTournament),
    tournamentPlayers: tournamentPlayers.rows.map(mapTournamentPlayer),
    tournamentScheduleItems: tournamentScheduleItems.rows.map(mapTournamentScheduleItem),
    games: games.rows.map(mapGame),
    points: points.rows.map(mapPoint),
    pointPlayers: pointPlayers.rows.map(mapPointPlayer),
    events: events.rows.map(mapEvent),
  };
}
