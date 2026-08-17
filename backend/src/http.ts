export type ApiRequest = {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string | undefined>;
};

export type ApiResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  cookies?: string[];
};

export function jsonResponse(statusCode: number, body: unknown): ApiResponse {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

export function badRequest(message: string): ApiResponse {
  return jsonResponse(400, {
    error: "bad_request",
    message,
  });
}

export function unauthorized(message = "A valid session is required."): ApiResponse {
  return jsonResponse(401, {
    error: "unauthorized",
    message,
  });
}

export function forbidden(message = "This session cannot access that resource."): ApiResponse {
  return jsonResponse(403, {
    error: "forbidden",
    message,
  });
}

export function notFound(path: string): ApiResponse {
  return jsonResponse(404, {
    error: "not_found",
    message: `No route found for ${path}.`,
  });
}

export function resourceNotFound(resource: string): ApiResponse {
  return jsonResponse(404, {
    error: "not_found",
    message: `${resource} was not found.`,
  });
}

export function methodNotAllowed(method: string): ApiResponse {
  return jsonResponse(405, {
    error: "method_not_allowed",
    message: `${method} is not allowed for this route.`,
  });
}
