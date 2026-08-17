import {
  authenticatePassword,
  clearSessionCookie,
  createSessionResponseCookie,
  readSession,
  withCookie,
} from "../auth.js";
import { badRequest, jsonResponse, methodNotAllowed, unauthorized, type ApiRequest } from "../http.js";

export function handleSessionRequest(request: ApiRequest) {
  if (request.method === "GET") {
    const session = readSession(request);
    return jsonResponse(200, session ? { authenticated: true, ...session } : { authenticated: false });
  }

  if (request.method === "POST") {
    if (!isObject(request.body) || typeof request.body.password !== "string") {
      return badRequest("Password is required.");
    }

    const role = authenticatePassword(request.body.password);
    if (!role) return unauthorized("The password is not valid.");

    const { cookie, session } = createSessionResponseCookie(role);
    return withCookie(jsonResponse(200, { authenticated: true, ...session }), cookie);
  }

  if (request.method === "DELETE") {
    return withCookie(jsonResponse(200, { authenticated: false }), clearSessionCookie());
  }

  return methodNotAllowed(request.method);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
