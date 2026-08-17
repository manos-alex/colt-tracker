import { FormEvent, useEffect, useRef, useState } from "react";
import { createEmptyData, mergeGameData, mergeTournamentData } from "./data";
import {
  createSession,
  deleteSession,
  fetchGameData,
  fetchPlayers,
  fetchSession,
  fetchTournamentData,
  fetchTournamentList,
} from "./lib/api";
import { paths, slugifyTournamentName } from "./lib/routes";
import GamePage from "./pages/GamePage";
import HomePage from "./pages/HomePage";
import RosterPage from "./pages/RosterPage";
import TournamentPage from "./pages/TournamentPage";
import TournamentsPage from "./pages/TournamentsPage";
import type { AppData, AuthRole, Id } from "./types";

type AuthState =
  | { status: "checking" }
  | { status: "signed-out" }
  | { role: AuthRole; status: "authenticated" };

const playersKey = "players";
const tournamentListKey = "tournaments";
const tournamentKey = (id: Id) => `tournament:${id}`;
const gameKey = (id: Id) => `game:${id}`;

function App() {
  const [auth, setAuth] = useState<AuthState>({ status: "checking" });
  const [authError, setAuthError] = useState("");
  const [data, setData] = useState<AppData>(() => createEmptyData());
  const [gameCounts, setGameCounts] = useState<Record<Id, number>>({});
  const [loadedKeys, setLoadedKeys] = useState<Set<string>>(() => new Set());
  const [loadError, setLoadError] = useState("");
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const inFlightKeys = useRef(new Set<string>());
  const requestGeneration = useRef(0);

  useEffect(() => {
    fetchSession()
      .then((session) => {
        setAuth(
          session.authenticated
            ? { status: "authenticated", role: session.role }
            : { status: "signed-out" },
        );
      })
      .catch((error: unknown) => {
        setAuthError(error instanceof Error ? error.message : "Unable to check the current session.");
        setAuth({ status: "signed-out" });
      });
  }, []);

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const handleExpiredSession = () => {
      resetLoadedData();
      setAuthError("Your session expired. Enter a password to continue.");
      setAuth({ status: "signed-out" });
    };

    window.addEventListener("colt-tracker-session-expired", handleExpiredSession);
    return () => window.removeEventListener("colt-tracker-session-expired", handleExpiredSession);
  }, []);

  useEffect(() => {
    if (auth.status !== "authenticated" || auth.role !== "viewer") return;
    if (pathname === paths.home) return;

    window.history.replaceState(null, "", paths.home);
    setPathname(paths.home);
  }, [auth, pathname]);

  useEffect(() => {
    setGameCounts((current) => {
      const next = { ...current };
      for (const key of loadedKeys) {
        if (!key.startsWith("tournament:")) continue;
        const tournamentId = key.slice("tournament:".length);
        next[tournamentId] = data.games.filter(
          (game) => game.tournamentId === tournamentId,
        ).length;
      }
      return next;
    });
  }, [data.games, loadedKeys]);

  useEffect(() => {
    if (auth.status !== "authenticated" || auth.role !== "admin") return;

    if (pathname === paths.roster) {
      loadOnce(playersKey, fetchPlayers, (players) => {
        setData((current) => ({ ...current, players }));
      });
      return;
    }

    if (pathname === paths.tournaments) {
      loadTournamentList();
      return;
    }

    if (pathname.startsWith("/tournament/")) {
      if (!loadedKeys.has(tournamentListKey)) {
        loadTournamentList();
        return;
      }

      const slug = pathname.replace("/tournament/", "");
      const tournament = data.tournaments.find(
        (item) => slugifyTournamentName(item.name) === slug,
      );
      if (!tournament) return;

      loadOnce(tournamentKey(tournament.id), () => fetchTournamentData(tournament.id), (tournamentData) => {
        setData((current) => mergeTournamentData(current, tournamentData, tournament.id));
        setGameCounts((current) => ({
          ...current,
          [tournament.id]: tournamentData.games.length,
        }));
      });
      return;
    }

    if (pathname.startsWith("/game/")) {
      const gameId = decodeURIComponent(pathname.replace("/game/", ""));
      loadOnce(gameKey(gameId), () => fetchGameData(gameId), (gameData) => {
        setData((current) => mergeGameData(current, gameData, gameId));
      });
    }
  }, [auth, data.tournaments, loadedKeys, pathname]);

  const loadTournamentList = () => {
    loadOnce(tournamentListKey, fetchTournamentList, (result) => {
      setData((current) => ({ ...current, tournaments: result.tournaments }));
      setGameCounts(result.gameCounts);
    });
  };

  const loadOnce = <T,>(key: string, load: () => Promise<T>, apply: (result: T) => void) => {
    if (loadedKeys.has(key) || inFlightKeys.current.has(key)) return;

    const generation = requestGeneration.current;
    inFlightKeys.current.add(key);
    setLoadError("");

    load()
      .then((result) => {
        if (generation !== requestGeneration.current) return;
        apply(result);
        setLoadedKeys((current) => new Set(current).add(key));
      })
      .catch((error: unknown) => {
        if (generation !== requestGeneration.current) return;
        setLoadError(error instanceof Error ? error.message : "Unable to load data for this page.");
      })
      .finally(() => {
        if (generation === requestGeneration.current) {
          inFlightKeys.current.delete(key);
        }
      });
  };

  const resetLoadedData = () => {
    requestGeneration.current += 1;
    inFlightKeys.current.clear();
    setData(createEmptyData());
    setGameCounts({});
    setLoadedKeys(new Set());
    setLoadError("");
  };

  const navigate = (path: string) => {
    if (path === window.location.pathname) return;
    window.history.pushState(null, "", path);
    setPathname(path);
  };

  const signOut = async () => {
    try {
      await deleteSession();
    } finally {
      resetLoadedData();
      setAuth({ status: "signed-out" });
      window.history.replaceState(null, "", paths.home);
      setPathname(paths.home);
    }
  };

  if (auth.status === "checking") {
    return <LoadingScreen label="Checking Session" />;
  }

  if (auth.status === "signed-out") {
    return (
      <PasswordGate
        error={authError}
        onAuthenticated={(role) => {
          setAuthError("");
          setAuth({ status: "authenticated", role });
        }}
      />
    );
  }

  const activePathname = auth.role === "viewer" ? paths.home : pathname;
  const isRouteReady = routeIsReady(activePathname, auth.role, data, loadedKeys);

  return (
    <main className="app-shell">
      <header className="top-bar">
        <button className="brand-button" onClick={() => navigate(paths.home)}>
          Colt Tracker
        </button>
        <nav className="top-nav" aria-label="Primary navigation">
          <button
            className={activePathname === paths.home ? "active" : ""}
            onClick={() => navigate(paths.home)}
          >
            Home
          </button>
          {auth.role === "admin" && (
            <>
              <button
                className={
                  pathname === paths.tournaments ||
                  pathname.startsWith("/tournament/") ||
                  pathname.startsWith("/game/")
                    ? "active"
                    : ""
                }
                onClick={() => navigate(paths.tournaments)}
              >
                Tournaments
              </button>
              <button
                className={pathname === paths.roster ? "active" : ""}
                onClick={() => navigate(paths.roster)}
              >
                Roster
              </button>
            </>
          )}
          <button className="ghost-button" onClick={() => void signOut()}>
            Sign Out
          </button>
        </nav>
      </header>

      {loadError && <p className="status-banner error">{loadError}</p>}

      {isRouteReady ? (
        <RouteView
          data={data}
          gameCounts={gameCounts}
          setData={setData}
          setGameCounts={setGameCounts}
          pathname={activePathname}
          navigate={navigate}
        />
      ) : !loadError ? (
        <section className="empty-state">
          <h1>Loading Data</h1>
        </section>
      ) : null}
    </main>
  );
}

function PasswordGate({
  error: initialError,
  onAuthenticated,
}: {
  error: string;
  onAuthenticated: (role: AuthRole) => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || isSubmitting) return;

    setIsSubmitting(true);
    setError("");
    try {
      const session = await createSession(password);
      if (session.authenticated) onAuthenticated(session.role);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to sign in.");
      setPassword("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-shell">
      <form className="auth-panel" onSubmit={submit}>
        <div>
          <p className="eyebrow">Colt Tracker</p>
          <h1>Enter Password</h1>
        </div>
        {error && <p className="status-banner error">{error}</p>}
        <label>
          <span>Password</span>
          <input
            autoComplete="current-password"
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="submit" disabled={!password || isSubmitting}>
          {isSubmitting ? "Checking" : "Continue"}
        </button>
      </form>
    </main>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <p className="eyebrow">Colt Tracker</p>
        <h1>{label}</h1>
      </section>
    </main>
  );
}

function routeIsReady(
  pathname: string,
  role: AuthRole,
  data: AppData,
  loadedKeys: Set<string>,
) {
  if (role === "viewer" || pathname === paths.home) return true;
  if (pathname === paths.roster) return loadedKeys.has(playersKey);
  if (pathname === paths.tournaments) return loadedKeys.has(tournamentListKey);

  if (pathname.startsWith("/tournament/")) {
    if (!loadedKeys.has(tournamentListKey)) return false;
    const slug = pathname.replace("/tournament/", "");
    const tournament = data.tournaments.find(
      (item) => slugifyTournamentName(item.name) === slug,
    );
    return !tournament || loadedKeys.has(tournamentKey(tournament.id));
  }

  if (pathname.startsWith("/game/")) {
    return loadedKeys.has(gameKey(decodeURIComponent(pathname.replace("/game/", ""))));
  }

  return true;
}

function RouteView({
  data,
  gameCounts,
  setData,
  setGameCounts,
  pathname,
  navigate,
}: {
  data: AppData;
  gameCounts: Record<Id, number>;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  setGameCounts: React.Dispatch<React.SetStateAction<Record<Id, number>>>;
  pathname: string;
  navigate: (path: string) => void;
}) {
  if (pathname === paths.home) return <HomePage />;

  if (pathname === paths.roster) {
    return <RosterPage data={data} setData={setData} />;
  }

  if (pathname === paths.tournaments) {
    return (
      <TournamentsPage
        data={data}
        gameCounts={gameCounts}
        setData={setData}
        setGameCounts={setGameCounts}
        navigate={navigate}
      />
    );
  }

  if (pathname.startsWith("/tournament/")) {
    const slug = pathname.replace("/tournament/", "");
    const tournament = data.tournaments.find(
      (item) => slugifyTournamentName(item.name) === slug,
    );

    if (!tournament) {
      return (
        <section className="empty-state">
          <h1>Tournament Not Found</h1>
          <button onClick={() => navigate(paths.tournaments)}>All Tournaments</button>
        </section>
      );
    }

    return (
      <TournamentPage
        data={data}
        tournament={tournament}
        setData={setData}
        navigate={navigate}
      />
    );
  }

  if (pathname.startsWith("/game/")) {
    const gameId = decodeURIComponent(pathname.replace("/game/", ""));
    const game = data.games.find((item) => item.id === gameId);
    const activePoint = data.points.find(
      (point) => point.gameId === gameId && point.status === "active",
    );

    if (!game) {
      return (
        <section className="empty-state">
          <h1>Game Not Found</h1>
          <button onClick={() => navigate(paths.tournaments)}>All Tournaments</button>
        </section>
      );
    }

    return (
      <GamePage
        data={data}
        game={game}
        activePoint={activePoint}
        setData={setData}
        navigate={navigate}
      />
    );
  }

  return (
    <section className="empty-state">
      <h1>Page Not Found</h1>
      <button onClick={() => navigate(paths.home)}>Dashboard</button>
    </section>
  );
}

export default App;
