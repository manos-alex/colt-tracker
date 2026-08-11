import { useEffect, useState } from "react";
import { createEmptyData } from "./data";
import { paths, slugifyTournamentName } from "./lib/routes";
import GamePage from "./pages/GamePage";
import HomePage from "./pages/HomePage";
import RosterPage from "./pages/RosterPage";
import TournamentPage from "./pages/TournamentPage";
import TournamentsPage from "./pages/TournamentsPage";
import type { AppData } from "./types";

function App() {
  const [data, setData] = useState<AppData>(() => createEmptyData());
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (path: string) => {
    if (path === window.location.pathname) return;

    window.history.pushState(null, "", path);
    setPathname(path);
  };

  const resetData = () => {
    setData(createEmptyData());
    navigate(paths.home);
  };

  return (
    <main className="app-shell">
      <header className="top-bar">
        <button className="brand-button" onClick={() => navigate(paths.home)}>
          Colt Tracker
        </button>
        <nav className="top-nav" aria-label="Primary navigation">
          <button
            className={pathname === paths.roster ? "active" : ""}
            onClick={() => navigate(paths.roster)}
          >
            Roster
          </button>
          <button
            className={
              pathname === paths.tournaments || pathname.startsWith("/tournament/")
                ? "active"
                : ""
            }
            onClick={() => navigate(paths.tournaments)}
          >
            Tournaments
          </button>
        </nav>
        <button className="ghost-button" onClick={resetData}>
          Reset Data
        </button>
      </header>

      <RouteView data={data} setData={setData} pathname={pathname} navigate={navigate} />
    </main>
  );
}

function RouteView({
  data,
  setData,
  pathname,
  navigate,
}: {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  pathname: string;
  navigate: (path: string) => void;
}) {
  if (pathname === paths.home) {
    return <HomePage />;
  }

  if (pathname === paths.roster) {
    return <RosterPage data={data} setData={setData} />;
  }

  if (pathname === paths.tournaments) {
    return <TournamentsPage data={data} setData={setData} navigate={navigate} />;
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

    return <GamePage data={data} game={game} activePoint={activePoint} setData={setData} />;
  }

  return (
    <section className="empty-state">
      <h1>Page Not Found</h1>
      <button onClick={() => navigate(paths.home)}>Dashboard</button>
    </section>
  );
}

export default App;
