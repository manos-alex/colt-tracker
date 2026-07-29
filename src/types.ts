export type Id = string;

export type Possession = "us" | "opponent";
export type ScoringTeam = Possession;
export type PointStatus = "active" | "complete";
export type FieldCoordinate = {
  x: number;
  y: number;
};
export type EventType =
  | "pass"
  | "turnover"
  | "throwaway"
  | "drop"
  | "opponent_block"
  | "block"
  | "opponent_turnover"
  | "opponent_score"
  | "callahan"
  | "injury";

export type Player = {
  id: Id;
  name: string;
  rosterPlayer: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Tournament = {
  id: Id;
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
};

export type TournamentPlayer = {
  id: Id;
  tournamentId: Id;
  playerId: Id;
  createdAt: string;
};

export type Game = {
  id: Id;
  tournamentId: Id;
  opponentName: string;
  gameDate: string;
  videoUrl: string;
  ourScore: number;
  opponentScore: number;
  currentPossession: Possession;
  activeThrowerId: Id | null;
  discX: number | null;
  discY: number | null;
  createdAt: string;
  updatedAt: string;
};

export type Point = {
  id: Id;
  gameId: Id;
  pointNumber: number;
  startedOnOffense: boolean;
  ourScoreStart: number;
  opponentScoreStart: number;
  ourScoreEnd: number | null;
  opponentScoreEnd: number | null;
  scoringTeam: ScoringTeam | null;
  status: PointStatus;
  createdAt: string;
  updatedAt: string;
};

export type PointPlayer = {
  id: Id;
  pointId: Id;
  playerId: Id;
  isStarter: boolean;
  createdAt: string;
};

export type Event = {
  id: Id;
  gameId: Id;
  pointId: Id;
  eventType: EventType;
  playerId: Id | null;
  secondaryPlayerId: Id | null;
  startX: number | null;
  startY: number | null;
  endX: number | null;
  endY: number | null;
  videoSeconds: number;
  createdAt: string;
};

export type AppData = {
  players: Player[];
  tournaments: Tournament[];
  tournamentPlayers: TournamentPlayer[];
  games: Game[];
  points: Point[];
  pointPlayers: PointPlayer[];
  events: Event[];
};
