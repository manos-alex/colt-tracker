import type { AppData, EventType, FieldCoordinate, Game, Id, Player, Possession } from "../types";

type CreatePlayerInput = {
  name: string;
  rosterPlayer: boolean;
};

type UpdatePlayerInput = Partial<Pick<Player, "name" | "rosterPlayer">>;

export async function fetchBootstrapData(): Promise<AppData> {
  return apiRequest<AppData>("/api/bootstrap");
}

export async function createPlayer(input: CreatePlayerInput): Promise<Player> {
  const response = await apiRequest<{ player: Player }>("/api/players", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return response.player;
}

export async function updatePlayer(playerId: Id, patch: UpdatePlayerInput): Promise<Player> {
  const response = await apiRequest<{ player: Player }>(
    `/api/players/${encodeURIComponent(playerId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );

  return response.player;
}

export async function deletePlayer(playerId: Id): Promise<void> {
  await apiRequest<{ deletedPlayerId: Id }>(`/api/players/${encodeURIComponent(playerId)}`, {
    method: "DELETE",
  });
}

export async function createTournament(input: {
  name: string;
  location: string;
}): Promise<{ data: AppData; tournamentId: Id | null }> {
  return apiRequest("/api/tournaments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function toggleTournamentPlayer(
  tournamentId: Id,
  playerId: Id,
): Promise<{ data: AppData }> {
  return apiRequest(`/api/tournaments/${encodeURIComponent(tournamentId)}/players/toggle`, {
    method: "POST",
    body: JSON.stringify({ playerId }),
  });
}

export async function selectRosteredTournamentPlayers(tournamentId: Id): Promise<{ data: AppData }> {
  return apiRequest(`/api/tournaments/${encodeURIComponent(tournamentId)}/players/rostered`, {
    method: "PUT",
  });
}

export async function createTournamentGame(input: {
  tournamentId: Id;
  opponentName: string;
  videoUrl: string;
  dayNumber: number;
}): Promise<{ data: AppData; gameId: Id | null }> {
  return apiRequest(`/api/tournaments/${encodeURIComponent(input.tournamentId)}/games`, {
    method: "POST",
    body: JSON.stringify({
      opponentName: input.opponentName,
      videoUrl: input.videoUrl,
      dayNumber: input.dayNumber,
    }),
  });
}

export async function createTournamentBye(tournamentId: Id, dayNumber: number): Promise<{ data: AppData }> {
  return apiRequest(`/api/tournaments/${encodeURIComponent(tournamentId)}/byes`, {
    method: "POST",
    body: JSON.stringify({ dayNumber }),
  });
}

export async function updateTournamentDayCount(
  tournamentId: Id,
  dayCount: number,
): Promise<{ data: AppData }> {
  return apiRequest(`/api/tournaments/${encodeURIComponent(tournamentId)}/day-count`, {
    method: "PATCH",
    body: JSON.stringify({ dayCount }),
  });
}

export async function moveTournamentScheduleItem(input: {
  tournamentId: Id;
  scheduleItemId: Id;
  targetDay: number;
  targetIndex: number;
}): Promise<{ data: AppData }> {
  return apiRequest(
    `/api/tournaments/${encodeURIComponent(input.tournamentId)}/schedule-items/${encodeURIComponent(
      input.scheduleItemId,
    )}/move`,
    {
      method: "POST",
      body: JSON.stringify({ targetDay: input.targetDay, targetIndex: input.targetIndex }),
    },
  );
}

export async function deleteTournamentScheduleItem(
  tournamentId: Id,
  scheduleItemId: Id,
): Promise<{ data: AppData }> {
  return apiRequest(
    `/api/tournaments/${encodeURIComponent(tournamentId)}/schedule-items/${encodeURIComponent(scheduleItemId)}`,
    { method: "DELETE" },
  );
}

export async function deleteTournamentDay(tournamentId: Id, dayNumber: number): Promise<{ data: AppData }> {
  return apiRequest(`/api/tournaments/${encodeURIComponent(tournamentId)}/days/${dayNumber}`, {
    method: "DELETE",
  });
}

export async function patchGame(gameId: Id, patch: Partial<Game>): Promise<{ data: AppData }> {
  return apiRequest(`/api/games/${encodeURIComponent(gameId)}`, {
    method: "PATCH",
    body: JSON.stringify({ patch }),
  });
}

export async function startGamePoint(input: {
  gameId: Id;
  starterIds: Id[];
  startedOnOffense: boolean;
  initialThrowerId: Id | null;
  initialSpot: FieldCoordinate;
  pullDetails?: {
    pullerId: Id;
    hangTimeSeconds: number;
    landingSpot: FieldCoordinate;
    inBounds: boolean;
    releaseVideoSeconds: number;
  };
}): Promise<{ data: AppData }> {
  return apiRequest(`/api/games/${encodeURIComponent(input.gameId)}/start-point`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function recordGameEvent(input: {
  gameId: Id;
  eventType: EventType;
  playerId?: Id | null;
  secondaryPlayerId?: Id | null;
  start?: FieldCoordinate | null;
  end?: FieldCoordinate | null;
  pullHangTimeSeconds?: number | null;
  pullInBounds?: boolean | null;
  videoSeconds: number;
  gamePatch?: Partial<Game>;
  subPlayerId?: Id | null;
}): Promise<{ data: AppData }> {
  return apiRequest(`/api/games/${encodeURIComponent(input.gameId)}/events`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function finishGamePoint(input: {
  gameId: Id;
  scoringTeam: Possession;
  eventType?: EventType;
  playerId?: Id | null;
  secondaryPlayerId?: Id | null;
  start?: FieldCoordinate | null;
  end?: FieldCoordinate | null;
  videoSeconds: number;
}): Promise<{ data: AppData }> {
  return apiRequest(`/api/games/${encodeURIComponent(input.gameId)}/finish-point`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteGameEvent(gameId: Id, eventId: Id): Promise<{ data: AppData }> {
  return apiRequest(
    `/api/games/${encodeURIComponent(gameId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }

  return response.json() as Promise<T>;
}

async function responseErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === "string" && body.message) {
      return body.message;
    }
  } catch {
    // Use the status text below when the response is not JSON.
  }

  return response.statusText || `Request failed with status ${response.status}`;
}
