import { getConfig } from "./config.js";
import { readSession } from "./auth.js";
import { handleGamesRequest } from "./routes/games.js";
import { handlePlayersRequest } from "./routes/players.js";
import { handleSessionRequest } from "./routes/session.js";
import { handleTournamentsRequest } from "./routes/tournaments.js";
import {
  forbidden,
  jsonResponse,
  methodNotAllowed,
  notFound,
  unauthorized,
  type ApiRequest,
  type ApiResponse,
} from "./http.js";

export async function handleRequest(request: ApiRequest): Promise<ApiResponse> {
  try {
    return await routeRequest(request);
  } catch (error) {
    console.error(error);

    return jsonResponse(500, {
      error: "internal_server_error",
      message: "The API could not complete the request.",
    });
  }
}

async function routeRequest(request: ApiRequest): Promise<ApiResponse> {
  const path = normalizePath(request.path);

  if (path === "/health" || path === "/api/health") {
    if (request.method !== "GET") {
      return methodNotAllowed(request.method);
    }

    const config = getConfig();
    return jsonResponse(200, {
      ok: true,
      service: config.projectName,
      environment: config.environment,
    });
  }

  if (path === "/api/session") {
    return handleSessionRequest({ ...request, path });
  }

  const session = readSession(request);
  if (!session) return unauthorized();
  const isStatsRoute = path === "/api/stats" || path.startsWith("/api/stats/");
  if (session.role === "viewer" && !isStatsRoute) return forbidden();

  if (path === "/api/players" || path.startsWith("/api/players/")) {
    return handlePlayersRequest({ ...request, path });
  }

  if (path === "/api/tournaments" || path.startsWith("/api/tournaments/")) {
    return handleTournamentsRequest({ ...request, path });
  }

  if (path.startsWith("/api/games/")) {
    return handleGamesRequest({ ...request, path });
  }

  return notFound(path);
}

function normalizePath(path: string) {
  if (!path) return "/";

  const [pathname] = path.split("?");
  return pathname === "" ? "/" : pathname;
}
