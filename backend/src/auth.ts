import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getAuthConfig } from "./config.js";
import type { ApiRequest, ApiResponse } from "./http.js";

export type AuthRole = "admin" | "viewer";

export type Session = {
  expiresAt: number;
  role: AuthRole;
};

const cookieName = "colt_tracker_session";
const sessionDurationSeconds = 24 * 60 * 60;

export function authenticatePassword(password: string): AuthRole | null {
  const config = getAuthConfig();

  if (secureCompare(password, config.adminPassword)) return "admin";
  if (secureCompare(password, config.viewerPassword)) return "viewer";
  return null;
}

export function readSession(request: ApiRequest): Session | null {
  const cookieHeader = request.headers?.cookie;
  if (!cookieHeader) return null;

  const token = parseCookies(cookieHeader)[cookieName];
  if (!token) return null;

  return verifySessionToken(token);
}

export function createSessionResponseCookie(role: AuthRole): {
  cookie: string;
  session: Session;
} {
  const config = getAuthConfig();
  const session = {
    role,
    expiresAt: Date.now() + sessionDurationSeconds * 1000,
  } satisfies Session;
  const token = signSession(session);
  const attributes = [
    `${cookieName}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${sessionDurationSeconds}`,
  ];

  if (config.secureCookies) attributes.push("Secure");

  return { cookie: attributes.join("; "), session };
}

export function clearSessionCookie(): string {
  const attributes = [
    `${cookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
  ];

  if (getAuthConfig().secureCookies) attributes.push("Secure");
  return attributes.join("; ");
}

export function withCookie(response: ApiResponse, cookie: string): ApiResponse {
  return { ...response, cookies: [cookie] };
}

function signSession(session: Session): string {
  const encodedPayload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function verifySessionToken(token: string): Session | null {
  const [encodedPayload, providedSignature, extra] = token.split(".");
  if (!encodedPayload || !providedSignature || extra) return null;

  const expectedSignature = sign(encodedPayload);
  if (!secureCompare(providedSignature, expectedSignature)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<Session>;
    if (parsed.role !== "admin" && parsed.role !== "viewer") return null;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt <= Date.now()) return null;

    return { role: parsed.role, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function sign(value: string) {
  return createHmac("sha256", getAuthConfig().sessionSecret).update(value).digest("base64url");
}

function secureCompare(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function parseCookies(header: string) {
  return Object.fromEntries(
    header.split(";").flatMap((part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex < 0) return [];
      return [[part.slice(0, separatorIndex).trim(), part.slice(separatorIndex + 1).trim()]];
    }),
  );
}
