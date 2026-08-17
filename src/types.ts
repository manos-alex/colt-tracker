export type Id = string;
export type AuthRole = "admin" | "viewer";

export type Possession = "us" | "opponent";
export type ScoringTeam = Possession;
export type PointStatus = "active" | "complete";
export type EndzoneSide = "left" | "right";
export type EventHalf = 1 | 2;
export type FieldCoordinate = {
  x: number;
  y: number;
};
export type EventType =
  | "pull"
  | "catch"
  | "pass"
  | "turnover"
  | "throwaway"
  | "drop"
  | "opponent_block"
  | "block"
  | "opponent_turnover"
  | "opponent_score"
  | "callahan"
  | "injury"
  | "pickup"
  | "half_time"
  | "full_time";

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
  dayCount: number;
  createdAt: string;
  updatedAt: string;
};

export type TournamentPlayer = {
  id: Id;
  tournamentId: Id;
  playerId: Id;
  createdAt: string;
};

export type TournamentScheduleItemType = "game" | "bye";

export type TournamentScheduleItem = {
  id: Id;
  tournamentId: Id;
  type: TournamentScheduleItemType;
  gameId: Id | null;
  label: string | null;
  dayNumber: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
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
  startingPossession: Possession | null;
  startingEndzone: EndzoneSide | null;
  secondHalfStarted: boolean;
  gameFinished: boolean;
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
  initialThrowerId: Id | null;
  initialDiscX: number | null;
  initialDiscY: number | null;
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
  pointId: Id | null;
  eventType: EventType;
  half: EventHalf;
  playerId: Id | null;
  secondaryPlayerId: Id | null;
  startX: number | null;
  startY: number | null;
  endX: number | null;
  endY: number | null;
  pullHangTimeSeconds: number | null;
  pullInBounds: boolean | null;
  fromPull: boolean | null;
  videoSeconds: number;
  createdAt: string;
};

export type AppData = {
  players: Player[];
  tournaments: Tournament[];
  tournamentPlayers: TournamentPlayer[];
  tournamentScheduleItems: TournamentScheduleItem[];
  games: Game[];
  points: Point[];
  pointPlayers: PointPlayer[];
  events: Event[];
};

export type TournamentListData = {
  gameCounts: Record<Id, number>;
  tournaments: Tournament[];
};
