import { createServer } from "node:http";
import "dotenv/config";
import { getConfig } from "./config.js";
import { handleRequest } from "./app.js";

const config = getConfig();

const server = createServer(async (request, response) => {
  const chunks: Buffer[] = [];

  request.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });

  request.on("end", async () => {
    const body = Buffer.concat(chunks).toString("utf8");
    const result = await handleRequest({
      method: request.method ?? "GET",
      path: request.url ?? "/",
      body: parseJsonBody(body),
      headers: normalizeHeaders(request.headers),
    });

    if (result.cookies) {
      response.setHeader("set-cookie", result.cookies);
    }
    response.writeHead(result.statusCode, result.headers);
    response.end(result.body);
  });
});

function normalizeHeaders(headers: typeof import("node:http").IncomingMessage.prototype.headers) {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name.toLowerCase(),
      Array.isArray(value) ? value.join(", ") : value,
    ]),
  );
}

server.listen(config.port, () => {
  console.log(`Colt Tracker API listening on http://localhost:${config.port}`);
});

function parseJsonBody(body: string) {
  if (!body) return undefined;

  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}
