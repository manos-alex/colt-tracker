import type { Tournament } from "../types";

export const paths = {
  home: "/",
  roster: "/roster",
  tournaments: "/tournaments",
  tournament: (tournament: Tournament) => `/tournament/${slugifyTournamentName(tournament.name)}`,
  game: (gameId: string) => `/game/${encodeURIComponent(gameId)}`,
};

export function slugifyTournamentName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "tournament";
}

