import { handleRequest } from "./app.js";

type ApiGatewayEvent = {
  requestContext?: {
    http?: {
      method?: string;
    };
  };
  rawPath?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
  headers?: Record<string, string | undefined>;
  cookies?: string[];
};

export async function handler(event: ApiGatewayEvent) {
  const body =
    event.body && event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;

  const result = await handleRequest({
    method: event.requestContext?.http?.method ?? "GET",
    path: event.rawPath ?? "/",
    body: parseJsonBody(body),
    headers: {
      ...normalizeHeaders(event.headers),
      ...(event.cookies?.length ? { cookie: event.cookies.join("; ") } : {}),
    },
  });

  return result;
}

function normalizeHeaders(headers: Record<string, string | undefined> | undefined) {
  return Object.fromEntries(
    Object.entries(headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]),
  );
}

function parseJsonBody(body: string | null | undefined) {
  if (!body) return undefined;

  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}
