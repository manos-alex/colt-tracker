import { getConfig } from "./config.js";
import { getBootstrapData } from "./routes/bootstrap.js";
import { handleGamesRequest } from "./routes/games.js";
import { handlePlayersRequest } from "./routes/players.js";
import { handleTournamentsRequest } from "./routes/tournaments.js";
import { jsonResponse, methodNotAllowed, notFound, type ApiRequest, type ApiResponse } from "./http.js";

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

  if (path === "/api/bootstrap") {
    if (request.method !== "GET") {
      return methodNotAllowed(request.method);
    }

    return jsonResponse(200, await getBootstrapData());
  }

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
