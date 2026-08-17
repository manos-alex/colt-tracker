import type { AppData, Id, TournamentListData } from "../../../src/types.js";
import { executeSql, sqlParam } from "../db/dataApi.js";
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

export async function getTournamentListData(): Promise<TournamentListData> {
  const result = await executeSql(
    `
      select tournaments.*, count(games.id) as game_count
      from tournaments
      left join games on games.tournament_id = tournaments.id
      group by tournaments.id
      order by tournaments.created_at, tournaments.name
    `,
  );

  return {
    tournaments: result.rows.map(mapTournament),
    gameCounts: Object.fromEntries(
      result.rows.map((row) => [String(row.id), Number(row.game_count ?? 0)]),
    ),
  };
}

export async function getTournamentData(tournamentId: Id): Promise<AppData> {
  const parameters = [sqlParam("tournamentId", tournamentId)];
  const [players, tournaments, tournamentPlayers, tournamentScheduleItems, games] = await Promise.all([
    executeSql("select * from players order by name, created_at"),
    executeSql(
      "select * from tournaments where id = cast(:tournamentId as uuid) limit 1",
      parameters,
    ),
    executeSql(
      "select * from tournament_players where tournament_id = cast(:tournamentId as uuid) order by created_at",
      parameters,
    ),
    executeSql(
      `
        select *
        from tournament_schedule_items
        where tournament_id = cast(:tournamentId as uuid)
        order by day_number, sort_order, created_at
      `,
      parameters,
    ),
    executeSql(
      "select * from games where tournament_id = cast(:tournamentId as uuid) order by created_at",
      parameters,
    ),
  ]);

  return {
    players: players.rows.map(mapPlayer),
    tournaments: tournaments.rows.map(mapTournament),
    tournamentPlayers: tournamentPlayers.rows.map(mapTournamentPlayer),
    tournamentScheduleItems: tournamentScheduleItems.rows.map(mapTournamentScheduleItem),
    games: games.rows.map(mapGame),
    points: [],
    pointPlayers: [],
    events: [],
  };
}

export async function getGameData(gameId: Id): Promise<AppData> {
  const parameters = [sqlParam("gameId", gameId)];
  const [players, tournaments, tournamentPlayers, games, points, pointPlayers, events] =
    await Promise.all([
      executeSql(
        `
          select players.*
          from players
          join tournament_players on tournament_players.player_id = players.id
          join games on games.tournament_id = tournament_players.tournament_id
          where games.id = cast(:gameId as uuid)
          order by players.name, players.created_at
        `,
        parameters,
      ),
      executeSql(
        `
          select tournaments.*
          from tournaments
          join games on games.tournament_id = tournaments.id
          where games.id = cast(:gameId as uuid)
          limit 1
        `,
        parameters,
      ),
      executeSql(
        `
          select tournament_players.*
          from tournament_players
          join games on games.tournament_id = tournament_players.tournament_id
          where games.id = cast(:gameId as uuid)
          order by tournament_players.created_at
        `,
        parameters,
      ),
      executeSql("select * from games where id = cast(:gameId as uuid) limit 1", parameters),
      executeSql(
        "select * from points where game_id = cast(:gameId as uuid) order by point_number",
        parameters,
      ),
      executeSql(
        `
          select point_players.*
          from point_players
          join points on points.id = point_players.point_id
          where points.game_id = cast(:gameId as uuid)
          order by point_players.created_at
        `,
        parameters,
      ),
      executeSql(
        `
          select *
          from events
          where game_id = cast(:gameId as uuid)
          order by video_seconds, created_at
        `,
        parameters,
      ),
    ]);

  return {
    players: players.rows.map(mapPlayer),
    tournaments: tournaments.rows.map(mapTournament),
    tournamentPlayers: tournamentPlayers.rows.map(mapTournamentPlayer),
    tournamentScheduleItems: [],
    games: games.rows.map(mapGame),
    points: points.rows.map(mapPoint),
    pointPlayers: pointPlayers.rows.map(mapPointPlayer),
    events: events.rows.map(mapEvent),
  };
}
