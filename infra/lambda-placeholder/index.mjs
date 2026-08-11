export async function handler(event) {
  const path = event.rawPath ?? "/";

  if (path === "/health") {
    return jsonResponse(200, {
      ok: true,
      service: process.env.PROJECT_NAME ?? "colt-tracker",
      environment: process.env.ENVIRONMENT ?? "dev",
    });
  }

  return jsonResponse(404, {
    error: "not_found",
    message: "API routes have not been implemented yet.",
  });
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  };
}
