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
};

export async function handler(event: ApiGatewayEvent) {
  const body =
    event.body && event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;

  return handleRequest({
    method: event.requestContext?.http?.method ?? "GET",
    path: event.rawPath ?? "/",
    body: parseJsonBody(body),
  });
}

function parseJsonBody(body: string | null | undefined) {
  if (!body) return undefined;

  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}
