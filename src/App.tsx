import {
  Dispatch,
  FormEvent,
  MutableRefObject,
  PointerEvent,
  ReactNode,
  SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { emptyData, loadData, saveData } from "./storage";
import type {
  AppData,
  EndzoneSide,
  Event,
  EventType,
  FieldCoordinate,
  Game,
  Id,
  Player,
  Point,
  PointPlayer,
  Possession,
  Tournament,
  TournamentPlayer,
} from "./types";
import { formatTimestamp, getYouTubeVideoId } from "./youtube";

type View = "dashboard" | "roster" | "data" | "charting";
type DataSetter = Dispatch<SetStateAction<AppData>>;

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const defaultDiscSpot: FieldCoordinate = { x: 20 / 110, y: 0.5 };
const defaultDiscSpotForAttack = (attackingEndzone: EndzoneSide): FieldCoordinate => ({
  x: attackingEndzone === "right" ? 20 / 110 : 90 / 110,
  y: 0.5,
});
const oppositePossession = (possession: Possession): Possession =>
  possession === "us" ? "opponent" : "us";
const oppositeEndzone = (endzone: EndzoneSide): EndzoneSide =>
  endzone === "left" ? "right" : "left";
const isGoalSpot = (spot: FieldCoordinate, attackingEndzone: EndzoneSide) =>
  attackingEndzone === "right" ? spot.x >= 90 / 110 : spot.x <= 20 / 110;
const pointStartingEndzone = (startingEndzone: EndzoneSide, pointNumber: number) =>
  pointNumber % 2 === 1 ? startingEndzone : oppositeEndzone(startingEndzone);
const pointAttackingEndzone = (startingEndzone: EndzoneSide, pointNumber: number) =>
  oppositeEndzone(pointStartingEndzone(startingEndzone, pointNumber));
const fieldReferenceMarkers: FieldCoordinate[] = [
  { x: 10 / 110, y: 0.5 },
  { x: 40 / 110, y: 0.5 },
  { x: 55 / 110, y: 0.5 },
  { x: 70 / 110, y: 0.5 },
  { x: 100 / 110, y: 0.5 },
];

const compareEventsAscending = (a: Event, b: Event) =>
  a.videoSeconds - b.videoSeconds || a.createdAt.localeCompare(b.createdAt);

const compareEventsDescending = (a: Event, b: Event) =>
  b.videoSeconds - a.videoSeconds || b.createdAt.localeCompare(a.createdAt);

const isPointScoreEvent = (event: Event, point: Point | undefined) =>
  event.eventType === "opponent_score" ||
  event.eventType === "callahan" ||
  (event.eventType === "pass" && point?.scoringTeam === "us" && point.status === "complete");

function rebuildActiveGameState(game: Game, activePoint: Point, events: Event[]): Partial<Game> {
  let currentPossession: Possession = activePoint.startedOnOffense ? "us" : "opponent";
  let activeThrowerId = activePoint.startedOnOffense ? activePoint.initialThrowerId : null;
  let discX = activePoint.startedOnOffense ? activePoint.initialDiscX : null;
  let discY = activePoint.startedOnOffense ? activePoint.initialDiscY : null;

  events
    .filter((event) => event.pointId === activePoint.id)
    .sort(compareEventsAscending)
    .forEach((event) => {
      if (event.eventType === "pass") {
        currentPossession = "us";
        activeThrowerId = event.secondaryPlayerId;
        discX = event.endX;
        discY = event.endY;
      }

      if (
        event.eventType === "throwaway" ||
        event.eventType === "drop" ||
        event.eventType === "opponent_block"
      ) {
        currentPossession = "opponent";
        activeThrowerId = null;
        discX = null;
        discY = null;
      }

      if (event.eventType === "opponent_turnover" || event.eventType === "block") {
        currentPossession = "us";
        activeThrowerId = null;
        discX = null;
        discY = null;
      }

      if (event.eventType === "pickup") {
        currentPossession = "us";
        activeThrowerId = event.playerId;
        discX = event.endX;
        discY = event.endY;
      }
    });

  return {
    ...game,
    currentPossession,
    activeThrowerId,
    discX,
    discY,
  };
}

function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [view, setView] = useState<View>("dashboard");
  const [selectedTournamentId, setSelectedTournamentId] = useState<Id | null>(
    () => loadData().tournaments[0]?.id ?? null,
  );
  const [selectedGameId, setSelectedGameId] = useState<Id | null>(null);

  useEffect(() => {
    saveData(data);
  }, [data]);

  const selectedTournament =
    data.tournaments.find((tournament) => tournament.id === selectedTournamentId) ?? null;
  const selectedGame = data.games.find((game) => game.id === selectedGameId) ?? null;
  const activePoint = data.points.find(
    (point) => point.gameId === selectedGameId && point.status === "active",
  );

  const navigate = (nextView: View) => {
    if (nextView !== "charting") {
      setSelectedGameId(null);
    }
    setView(nextView);
  };

  const openGame = (gameId: Id) => {
    const game = data.games.find((item) => item.id === gameId);
    if (game) {
      setSelectedTournamentId(game.tournamentId);
    }
    setSelectedGameId(gameId);
    setView("charting");
  };

  return (
    <main className="app-shell">
      <header className="top-bar">
        <button className="brand-button" onClick={() => navigate("dashboard")}>
          Colt Tracker
        </button>
        <nav className="top-nav" aria-label="Primary navigation">
          <button
            className={view === "roster" ? "active" : ""}
            onClick={() => navigate("roster")}
          >
            Roster
          </button>
          <button className={view === "data" ? "active" : ""} onClick={() => navigate("data")}>
            Add Data
          </button>
        </nav>
        <button className="ghost-button" onClick={() => setData(emptyData())}>
          Reset PoC Data
        </button>
      </header>

      {view === "dashboard" && <DashboardPage />}
      {view === "roster" && <RosterPage data={data} setData={setData} />}
      {view === "data" && (
        <DataEntryPage
          data={data}
          selectedTournament={selectedTournament}
          selectedTournamentId={selectedTournamentId}
          setData={setData}
          setSelectedTournamentId={setSelectedTournamentId}
          openGame={openGame}
        />
      )}
      {view === "charting" &&
        (selectedGame ? (
          <ChartingPage
            data={data}
            game={selectedGame}
            activePoint={activePoint}
            setData={setData}
          />
        ) : (
          <section className="empty-state">
            <h1>No Game Selected</h1>
            <button onClick={() => navigate("data")}>Add Data</button>
          </section>
        ))}
    </main>
  );
}

function DashboardPage() {
  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>Team Statistics</h1>
        </div>
      </div>
      <div className="dashboard-canvas" aria-label="Future statistics dashboard" />
    </section>
  );
}

function RosterPage({ data, setData }: { data: AppData; setData: DataSetter }) {
  const [playerName, setPlayerName] = useState("");
  const [rosterPlayer, setRosterPlayer] = useState(true);

  const addPlayer = (event: FormEvent) => {
    event.preventDefault();
    const name = playerName.trim();
    if (!name) return;

    const timestamp = now();
    const player: Player = {
      id: id(),
      name,
      rosterPlayer,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    setData((current) => ({ ...current, players: [...current.players, player] }));
    setPlayerName("");
    setRosterPlayer(true);
  };

  const updatePlayer = (playerId: Id, patch: Partial<Player>) => {
    setData((current) => ({
      ...current,
      players: current.players.map((player) =>
        player.id === playerId ? { ...player, ...patch, updatedAt: now() } : player,
      ),
    }));
  };

  const removePlayer = (playerId: Id) => {
    setData((current) => ({
      ...current,
      players: current.players.filter((item) => item.id !== playerId),
      tournamentPlayers: current.tournamentPlayers.filter((item) => item.playerId !== playerId),
      pointPlayers: current.pointPlayers.filter((item) => item.playerId !== playerId),
      events: current.events.map((item) => ({
        ...item,
        playerId: item.playerId === playerId ? null : item.playerId,
        secondaryPlayerId: item.secondaryPlayerId === playerId ? null : item.secondaryPlayerId,
      })),
    }));
  };

  const rosteredCount = data.players.filter((player) => player.rosterPlayer).length;

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Roster</p>
          <h1>Players</h1>
        </div>
        <div className="metric-strip">
          <span>{data.players.length} total</span>
          <span>{rosteredCount} rostered</span>
        </div>
      </div>

      <section className="wide-panel">
        <form className="roster-form" onSubmit={addPlayer}>
          <input
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
            placeholder="Player name"
          />
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={rosterPlayer}
              onChange={(event) => setRosterPlayer(event.target.checked)}
            />
            <span>Rostered</span>
          </label>
          <button type="submit">Add Player</button>
        </form>

        <div className="table-list">
          <div className="table-header">
            <span>Name</span>
            <span>Rostered</span>
            <span />
          </div>
          {data.players.map((player) => (
            <div className="table-row" key={player.id}>
              <input
                value={player.name}
                onChange={(event) => updatePlayer(player.id, { name: event.target.value })}
                aria-label={`${player.name} name`}
              />
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={player.rosterPlayer}
                  onChange={(event) =>
                    updatePlayer(player.id, { rosterPlayer: event.target.checked })
                  }
                />
                <span>{player.rosterPlayer ? "Yes" : "No"}</span>
              </label>
              <button className="ghost-button" onClick={() => removePlayer(player.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function DataEntryPage({
  data,
  selectedTournament,
  selectedTournamentId,
  setData,
  setSelectedTournamentId,
  openGame,
}: {
  data: AppData;
  selectedTournament: Tournament | null;
  selectedTournamentId: Id | null;
  setData: DataSetter;
  setSelectedTournamentId: (id: Id | null) => void;
  openGame: (gameId: Id) => void;
}) {
  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Add Data</p>
          <h1>Tournaments And Games</h1>
        </div>
      </div>
      <div className="data-entry-grid">
        <TournamentPanel
          data={data}
          selectedTournamentId={selectedTournamentId}
          setData={setData}
          setSelectedTournamentId={setSelectedTournamentId}
        />
        <GamePanel
          data={data}
          selectedTournament={selectedTournament}
          setData={setData}
          openGame={openGame}
        />
      </div>
    </section>
  );
}

function TournamentPanel({
  data,
  selectedTournamentId,
  setData,
  setSelectedTournamentId,
}: {
  data: AppData;
  selectedTournamentId: Id | null;
  setData: DataSetter;
  setSelectedTournamentId: (id: Id | null) => void;
}) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [isAddingTournament, setIsAddingTournament] = useState(false);

  const addTournament = (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const timestamp = now();
    const tournament: Tournament = {
      id: id(),
      name: trimmedName,
      location: location.trim(),
      startDate: "",
      endDate: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    setData((current) => ({
      ...current,
      tournaments: [...current.tournaments, tournament],
    }));
    setSelectedTournamentId(tournament.id);
    setName("");
    setLocation("");
    setIsAddingTournament(false);
  };

  const cancelAddTournament = () => {
    setName("");
    setLocation("");
    setIsAddingTournament(false);
  };

  const selectedPlayers = new Set(
    data.tournamentPlayers
      .filter((item) => item.tournamentId === selectedTournamentId)
      .map((item) => item.playerId),
  );
  const selectedTournament = data.tournaments.find(
    (tournament) => tournament.id === selectedTournamentId,
  );

  const toggleTournamentPlayer = (playerId: Id) => {
    if (!selectedTournamentId) return;

    setData((current) => {
      const existing = current.tournamentPlayers.find(
        (item) => item.tournamentId === selectedTournamentId && item.playerId === playerId,
      );

      if (existing) {
        return {
          ...current,
          tournamentPlayers: current.tournamentPlayers.filter((item) => item.id !== existing.id),
        };
      }

      const tournamentPlayer: TournamentPlayer = {
        id: id(),
        tournamentId: selectedTournamentId,
        playerId,
        createdAt: now(),
      };

      return {
        ...current,
        tournamentPlayers: [...current.tournamentPlayers, tournamentPlayer],
      };
    });
  };

  const selectRosteredPlayers = () => {
    if (!selectedTournamentId) return;

    const currentIds = new Set(
      data.tournamentPlayers
        .filter((item) => item.tournamentId !== selectedTournamentId)
        .map((item) => item.id),
    );
    const rosteredSelections = data.players
      .filter((player) => player.rosterPlayer)
      .map<TournamentPlayer>((player) => ({
        id: id(),
        tournamentId: selectedTournamentId,
        playerId: player.id,
        createdAt: now(),
      }));

    setData((current) => ({
      ...current,
      tournamentPlayers: [
        ...current.tournamentPlayers.filter((item) => currentIds.has(item.id)),
        ...rosteredSelections,
      ],
    }));
  };

  return (
    <section className="wide-panel">
      <div className="panel-heading">
        <h2>Tournaments</h2>
        <span>{data.tournaments.length}</span>
      </div>
      {isAddingTournament ? (
        <form className="picker-create-row" onSubmit={addTournament}>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name"
          />
          <input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Location"
          />
          <button type="submit">Save</button>
          <button type="button" className="ghost-button" onClick={cancelAddTournament}>
            Cancel
          </button>
        </form>
      ) : selectedTournament ? (
        <>
          <div className="detail-heading">
            <button className="ghost-button compact-button" onClick={() => setSelectedTournamentId(null)}>
              Back
            </button>
            <div>
              <strong>{selectedTournament.name}</strong>
              <span>{selectedTournament.location || "No location"}</span>
            </div>
          </div>
          <div className="section-title">
            <h2>Tournament Roster</h2>
            <button
              className="ghost-button compact-button"
              disabled={!selectedTournamentId}
              onClick={selectRosteredPlayers}
            >
              Select Rostered
            </button>
          </div>
          <div className="checklist tall">
            {data.players.map((player) => (
              <label key={player.id}>
                <input
                  type="checkbox"
                  checked={selectedPlayers.has(player.id)}
                  disabled={!selectedTournamentId}
                  onChange={() => toggleTournamentPlayer(player.id)}
                />
                <span>{player.name}</span>
                <em>{player.rosterPlayer ? "Rostered" : "Non-rostered"}</em>
              </label>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="list-action-row">
            <span>Select a tournament</span>
            <button onClick={() => setIsAddingTournament(true)}>Add New</button>
          </div>
          <div className="selection-list">
            {data.tournaments.map((tournament) => {
              const gameCount = data.games.filter((game) => game.tournamentId === tournament.id).length;

              return (
                <button
                  className="selection-row"
                  key={tournament.id}
                  onClick={() => setSelectedTournamentId(tournament.id)}
                >
                  <span>
                    <strong>{tournament.name}</strong>
                    <em>{tournament.location || "No location"}</em>
                  </span>
                  <b>{gameCount} games</b>
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function GamePanel({
  data,
  selectedTournament,
  setData,
  openGame,
}: {
  data: AppData;
  selectedTournament: Tournament | null;
  setData: DataSetter;
  openGame: (gameId: Id) => void;
}) {
  const [opponentName, setOpponentName] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [isAddingGame, setIsAddingGame] = useState(false);

  const tournamentGames = data.games.filter(
    (game) => game.tournamentId === selectedTournament?.id,
  );

  const addGame = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTournament || !opponentName.trim()) return;

    const timestamp = now();
    const game: Game = {
      id: id(),
      tournamentId: selectedTournament.id,
      opponentName: opponentName.trim(),
      gameDate: "",
      videoUrl: videoUrl.trim(),
      ourScore: 0,
      opponentScore: 0,
      currentPossession: "us",
      startingPossession: null,
      startingEndzone: null,
      secondHalfStarted: false,
      gameFinished: false,
      activeThrowerId: null,
      discX: null,
      discY: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    setData((current) => ({ ...current, games: [...current.games, game] }));
    setOpponentName("");
    setVideoUrl("");
    setIsAddingGame(false);
    openGame(game.id);
  };

  const cancelAddGame = () => {
    setOpponentName("");
    setVideoUrl("");
    setIsAddingGame(false);
  };

  return (
    <section className="wide-panel">
      <div className="panel-heading">
        <h2>Games</h2>
        <span>{tournamentGames.length}</span>
      </div>
      {isAddingGame ? (
        <form className="picker-create-row" onSubmit={addGame}>
          <input
            value={opponentName}
            onChange={(event) => setOpponentName(event.target.value)}
            placeholder="Opponent"
            disabled={!selectedTournament}
          />
          <input
            value={videoUrl}
            onChange={(event) => setVideoUrl(event.target.value)}
            placeholder="YouTube URL"
            disabled={!selectedTournament}
          />
          <button type="submit" disabled={!selectedTournament}>
            Save
          </button>
          <button type="button" className="ghost-button" onClick={cancelAddGame}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          <div className="list-action-row">
            <span>{selectedTournament ? `Games for ${selectedTournament.name}` : "Select a tournament first"}</span>
            <button disabled={!selectedTournament} onClick={() => setIsAddingGame(true)}>
              Add New
            </button>
          </div>
          <div className="selection-list">
            {tournamentGames.map((game) => (
              <button className="selection-row" key={game.id} onClick={() => openGame(game.id)}>
                <span>
                  <strong>vs {game.opponentName}</strong>
                  <em>{game.videoUrl ? "YouTube linked" : "No video URL"}</em>
                </span>
                <b>
                  {game.ourScore}-{game.opponentScore}
                </b>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function ChartingPage({
  data,
  game,
  activePoint,
  setData,
}: {
  data: AppData;
  game: Game;
  activePoint: Point | undefined;
  setData: DataSetter;
}) {
  return <ChartingWorkspace data={data} game={game} activePoint={activePoint} setData={setData} />;
}

function ChartingWorkspace({
  data,
  game,
  activePoint,
  setData,
}: {
  data: AppData;
  game: Game;
  activePoint: Point | undefined;
  setData: DataSetter;
}) {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const tournamentPlayerIds = new Set(
    data.tournamentPlayers
      .filter((item) => item.tournamentId === game.tournamentId)
      .map((item) => item.playerId),
  );
  const availablePlayers = data.players.filter((player) => tournamentPlayerIds.has(player.id));
  const gameEvents = data.events.filter((event) => event.gameId === game.id);
  const pointEvents = activePoint
    ? gameEvents.filter((event) => event.pointId === activePoint.id)
    : [];
  const currentPointNumber = game.ourScore + game.opponentScore + 1;
  const currentHalfLabel = game.secondHalfStarted ? "2nd Half" : "1st Half";
  const attackingEndzone = game.startingEndzone
    ? pointAttackingEndzone(game.startingEndzone, activePoint?.pointNumber ?? currentPointNumber)
    : "right";
  const latestEvent = [...gameEvents].sort(compareEventsDescending)[0];

  const getVideoSeconds = () => Math.floor(playerRef.current?.getCurrentTime() ?? 0);
  const seekVideo = (seconds: number) => {
    playerRef.current?.seekTo(seconds, true);
    playerRef.current?.pauseVideo();
  };

  const addEvent = (
    eventType: EventType,
    playerId: Id | null = null,
    secondaryPlayerId: Id | null = null,
    coordinates: {
      start?: FieldCoordinate | null;
      end?: FieldCoordinate | null;
    } = {},
  ) => {
    if (!activePoint) return;

    const event: Event = {
      id: id(),
      gameId: game.id,
      pointId: activePoint.id,
      eventType,
      half: game.secondHalfStarted ? 2 : 1,
      playerId,
      secondaryPlayerId,
      startX: coordinates.start?.x ?? null,
      startY: coordinates.start?.y ?? null,
      endX: coordinates.end?.x ?? null,
      endY: coordinates.end?.y ?? null,
      videoSeconds: getVideoSeconds(),
      createdAt: now(),
    };

    setData((current) => ({ ...current, events: [...current.events, event] }));
  };

  const addTimelineEvent = (eventType: "half_time" | "full_time") => {
    const event: Event = {
      id: id(),
      gameId: game.id,
      pointId: null,
      eventType,
      half: eventType === "half_time" ? 1 : 2,
      playerId: null,
      secondaryPlayerId: null,
      startX: null,
      startY: null,
      endX: null,
      endY: null,
      videoSeconds: getVideoSeconds(),
      createdAt: now(),
    };

    setData((current) => ({ ...current, events: [...current.events, event] }));
  };

  const updateGame = (patch: Partial<Game>) => {
    setData((current) => ({
      ...current,
      games: current.games.map((item) =>
        item.id === game.id ? { ...item, ...patch, updatedAt: now() } : item,
      ),
    }));
  };

  const startPoint = (
    starterIds: Id[],
    startedOnOffense: boolean,
    initialThrowerId: Id | null,
    initialSpot: FieldCoordinate,
  ) => {
    const timestamp = now();
    const point: Point = {
      id: id(),
      gameId: game.id,
      pointNumber: currentPointNumber,
      startedOnOffense,
      ourScoreStart: game.ourScore,
      opponentScoreStart: game.opponentScore,
      ourScoreEnd: null,
      opponentScoreEnd: null,
      scoringTeam: null,
      initialThrowerId: startedOnOffense ? initialThrowerId : null,
      initialDiscX: startedOnOffense ? initialSpot.x : null,
      initialDiscY: startedOnOffense ? initialSpot.y : null,
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const pointPlayers: PointPlayer[] = starterIds.map((playerId) => ({
      id: id(),
      pointId: point.id,
      playerId,
      isStarter: true,
      createdAt: timestamp,
    }));

    setData((current) => ({
      ...current,
      points: [...current.points, point],
      pointPlayers: [...current.pointPlayers, ...pointPlayers],
      games: current.games.map((item) =>
        item.id === game.id
          ? {
              ...item,
              currentPossession: startedOnOffense ? "us" : "opponent",
              activeThrowerId: startedOnOffense ? initialThrowerId : null,
              discX: startedOnOffense ? initialSpot.x : null,
              discY: startedOnOffense ? initialSpot.y : null,
              updatedAt: timestamp,
            }
          : item,
      ),
    }));
  };

  const addSub = (playerId: Id) => {
    if (!activePoint) return;

    const pointPlayer: PointPlayer = {
      id: id(),
      pointId: activePoint.id,
      playerId,
      isStarter: false,
      createdAt: now(),
    };

    setData((current) => ({
      ...current,
      pointPlayers: [...current.pointPlayers, pointPlayer],
    }));
  };

  const finishPoint = (
    scoringTeam: Possession,
    eventType?: EventType,
    playerId?: Id | null,
    secondaryPlayerId?: Id | null,
    coordinates: {
      start?: FieldCoordinate | null;
      end?: FieldCoordinate | null;
    } = {},
  ) => {
    if (!activePoint) return;

    const ourScore = game.ourScore + (scoringTeam === "us" ? 1 : 0);
    const opponentScore = game.opponentScore + (scoringTeam === "opponent" ? 1 : 0);

    setData((current) => ({
      ...current,
      events: eventType
        ? [
            ...current.events,
            {
              id: id(),
              gameId: game.id,
              pointId: activePoint.id,
              eventType,
              half: game.secondHalfStarted ? 2 : 1,
              playerId: playerId ?? null,
              secondaryPlayerId: secondaryPlayerId ?? null,
              startX: coordinates.start?.x ?? null,
              startY: coordinates.start?.y ?? null,
              endX: coordinates.end?.x ?? null,
              endY: coordinates.end?.y ?? null,
              videoSeconds: getVideoSeconds(),
              createdAt: now(),
            },
          ]
        : current.events,
      points: current.points.map((point) =>
        point.id === activePoint.id
          ? {
              ...point,
              ourScoreEnd: ourScore,
              opponentScoreEnd: opponentScore,
              scoringTeam,
              status: "complete",
              updatedAt: now(),
            }
          : point,
      ),
      games: current.games.map((item) =>
        item.id === game.id
          ? {
              ...item,
              ourScore,
              opponentScore,
              currentPossession: scoringTeam === "us" ? "opponent" : "us",
              activeThrowerId: null,
              discX: null,
              discY: null,
              updatedAt: now(),
            }
          : item,
      ),
    }));
  };

  const removeEvent = (eventId: Id, shouldSeek = true) => {
    const eventToRemove = data.events.find((event) => event.id === eventId);
    if (!eventToRemove) return;

    if (shouldSeek) {
      seekVideo(eventToRemove.videoSeconds);
    }

    setData((current) => {
      const targetEvent = current.events.find((event) => event.id === eventId);
      const currentGame = current.games.find((item) => item.id === game.id);
      if (!targetEvent || !currentGame) return current;

      const timestamp = now();
      const nextEvents = current.events.filter((event) => event.id !== eventId);
      let nextPoints = current.points;
      let nextPointPlayers = current.pointPlayers;
      let gamePatch: Partial<Game> = { updatedAt: timestamp };

      if (targetEvent.eventType === "injury" && targetEvent.pointId && targetEvent.secondaryPlayerId) {
        nextPointPlayers = nextPointPlayers.filter(
          (item) =>
            !(
              item.pointId === targetEvent.pointId &&
              item.playerId === targetEvent.secondaryPlayerId &&
              !item.isStarter
            ),
        );
      }

      if (targetEvent.eventType === "full_time") {
        gamePatch = { ...gamePatch, gameFinished: false };
      }

      if (targetEvent.eventType === "half_time") {
        gamePatch = {
          ...gamePatch,
          secondHalfStarted: false,
          currentPossession: currentGame.startingPossession ?? currentGame.currentPossession,
          activeThrowerId: null,
          discX: null,
          discY: null,
        };
      }

      const targetPoint = current.points.find((point) => point.id === targetEvent.pointId);
      const hasLaterPoint = targetPoint
        ? current.points.some(
            (point) => point.gameId === game.id && point.pointNumber > targetPoint.pointNumber,
          )
        : false;

      if (targetPoint && isPointScoreEvent(targetEvent, targetPoint) && !hasLaterPoint) {
        nextPoints = nextPoints.map((point) =>
          point.id === targetPoint.id
            ? {
                ...point,
                ourScoreEnd: null,
                opponentScoreEnd: null,
                scoringTeam: null,
                status: "active",
                updatedAt: timestamp,
              }
            : point,
        );
        gamePatch = {
          ...gamePatch,
          ourScore: targetPoint.ourScoreStart,
          opponentScore: targetPoint.opponentScoreStart,
          gameFinished: false,
        };
      }

      const nextActivePoint = nextPoints.find(
        (point) => point.gameId === game.id && point.status === "active",
      );

      if (nextActivePoint) {
        gamePatch = {
          ...gamePatch,
          ...rebuildActiveGameState({ ...currentGame, ...gamePatch }, nextActivePoint, nextEvents),
        };
      }

      return {
        ...current,
        events: nextEvents,
        points: nextPoints,
        pointPlayers: nextPointPlayers,
        games: current.games.map((item) =>
          item.id === game.id ? { ...item, ...gamePatch, updatedAt: timestamp } : item,
        ),
      };
    });
  };

  const undoLastEvent = () => {
    if (!latestEvent) return;

    removeEvent(latestEvent.id);
  };

  const editFinishedGame = () => {
    const fullTimeEvent = [...gameEvents]
      .filter((event) => event.eventType === "full_time")
      .sort(compareEventsDescending)[0];

    if (fullTimeEvent) {
      removeEvent(fullTimeEvent.id, false);
      return;
    }

    updateGame({ gameFinished: false });
  };

  return (
    <section className="charting">
      <ScoreBar
        game={game}
        activePoint={activePoint}
        pointNumber={currentPointNumber}
        halfLabel={currentHalfLabel}
      />
      <div className="charting-grid">
        <div className="charting-primary">
          <YouTubeEmbed videoUrl={game.videoUrl} playerRef={playerRef} />
          <ControlPanel
            game={game}
            activePoint={activePoint}
            currentPointNumber={currentPointNumber}
            attackingEndzone={attackingEndzone}
            availablePlayers={availablePlayers}
            pointPlayers={data.pointPlayers.filter((item) => item.pointId === activePoint?.id)}
            events={pointEvents}
            players={data.players}
            latestEvent={latestEvent}
            startPoint={startPoint}
            addSub={addSub}
            addEvent={addEvent}
            addTimelineEvent={addTimelineEvent}
            updateGame={updateGame}
            finishPoint={finishPoint}
            undoLastEvent={undoLastEvent}
            editFinishedGame={editFinishedGame}
          />
        </div>
        <EventLog
          events={gameEvents}
          points={data.points}
          players={data.players}
          seekVideo={seekVideo}
          deleteEvent={removeEvent}
        />
      </div>
    </section>
  );
}

function ScoreBar({
  game,
  activePoint,
  pointNumber,
  halfLabel,
}: {
  game: Game;
  activePoint: Point | undefined;
  pointNumber: number;
  halfLabel: string;
}) {
  const startingPossession = activePoint
    ? activePoint.startedOnOffense
      ? "us"
      : "opponent"
    : game.currentPossession;

  return (
    <div className="score-bar">
      <ScoreTeam
        label="Colt"
        score={game.ourScore}
        active={startingPossession === "us"}
        tone="blue"
        side="left"
      />
      <div className="point-pill">
        <strong>Point {pointNumber}</strong>
        <span>{halfLabel}</span>
      </div>
      <ScoreTeam
        label={game.opponentName}
        score={game.opponentScore}
        active={startingPossession === "opponent"}
        tone="red"
        side="right"
      />
    </div>
  );
}

function ScoreTeam({
  label,
  score,
  active,
  tone,
  side,
}: {
  label: string;
  score: number;
  active: boolean;
  tone: "blue" | "red";
  side: "left" | "right";
}) {
  return (
    <div className={`score-team ${active ? "is-active" : ""} ${tone} ${side}`}>
      <span className="team-name">
        <span className="offense-dot" aria-hidden="true" />
        {label}
      </span>
      <strong>{score}</strong>
    </div>
  );
}

function YouTubeEmbed({
  videoUrl,
  playerRef,
}: {
  videoUrl: string;
  playerRef: MutableRefObject<YouTubePlayer | null>;
}) {
  const elementId = useMemo(() => `youtube-${id()}`, []);
  const videoId = getYouTubeVideoId(videoUrl);

  useEffect(() => {
    if (!videoId) return;

    let cancelled = false;

    const createPlayer = () => {
      if (cancelled || !window.YT) return;
      playerRef.current?.destroy();
      playerRef.current = new window.YT.Player(elementId, {
        videoId,
        playerVars: { modestbranding: 1, rel: 0 },
      });
    };

    if (window.YT?.Player) {
      createPlayer();
    } else {
      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[src="https://www.youtube.com/iframe_api"]',
      );

      if (!existingScript) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.body.appendChild(script);
      }

      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previousReady?.();
        createPlayer();
      };
    }

    return () => {
      cancelled = true;
    };
  }, [elementId, playerRef, videoId]);

  if (!videoId) {
    return (
      <div className="video-placeholder">
        <span>YouTube URL Required</span>
      </div>
    );
  }

  return <div className="video-frame" id={elementId} />;
}

function ControlPanel({
  game,
  activePoint,
  currentPointNumber,
  attackingEndzone,
  availablePlayers,
  pointPlayers,
  events,
  players,
  latestEvent,
  startPoint,
  addSub,
  addEvent,
  addTimelineEvent,
  updateGame,
  finishPoint,
  undoLastEvent,
  editFinishedGame,
}: {
  game: Game;
  activePoint: Point | undefined;
  currentPointNumber: number;
  attackingEndzone: EndzoneSide;
  availablePlayers: Player[];
  pointPlayers: PointPlayer[];
  events: Event[];
  players: Player[];
  latestEvent: Event | undefined;
  startPoint: (
    starterIds: Id[],
    startedOnOffense: boolean,
    initialThrowerId: Id | null,
    initialSpot: FieldCoordinate,
  ) => void;
  addSub: (playerId: Id) => void;
  addEvent: (
    eventType: EventType,
    playerId?: Id | null,
    secondaryPlayerId?: Id | null,
    coordinates?: {
      start?: FieldCoordinate | null;
      end?: FieldCoordinate | null;
    },
  ) => void;
  addTimelineEvent: (eventType: "half_time" | "full_time") => void;
  updateGame: (patch: Partial<Game>) => void;
  finishPoint: (
    scoringTeam: Possession,
    eventType?: EventType,
    playerId?: Id | null,
    secondaryPlayerId?: Id | null,
    coordinates?: {
      start?: FieldCoordinate | null;
      end?: FieldCoordinate | null;
    },
  ) => void;
  undoLastEvent: () => void;
  editFinishedGame: () => void;
}) {
  const [starterIds, setStarterIds] = useState<Id[]>([]);
  const [setupPossession, setSetupPossession] = useState<Possession>("us");
  const [setupEndzone, setSetupEndzone] = useState<EndzoneSide>("left");
  const [lineConfirmed, setLineConfirmed] = useState(false);
  const [initialThrowerId, setInitialThrowerId] = useState("");
  const [initialSpot, setInitialSpot] = useState<FieldCoordinate>(() =>
    defaultDiscSpotForAttack(attackingEndzone),
  );
  const [subPlayerId, setSubPlayerId] = useState("");
  const [mode, setMode] = useState<
    "default" | "pass" | "drop" | "block" | "pickup" | "callahan" | "injury"
  >("default");
  const [receiverId, setReceiverId] = useState("");
  const [passEndSpot, setPassEndSpot] = useState<FieldCoordinate | null>(null);
  const [pickupPlayerId, setPickupPlayerId] = useState("");
  const [pickupSpot, setPickupSpot] = useState<FieldCoordinate | null>(null);
  const [callahanPlayerId, setCallahanPlayerId] = useState("");
  const [injuredPlayerId, setInjuredPlayerId] = useState("");

  useEffect(() => {
    setStarterIds([]);
    setLineConfirmed(false);
    setInitialSpot(defaultDiscSpotForAttack(attackingEndzone));
    setMode("default");
    setReceiverId("");
    setPassEndSpot(null);
    setPickupPlayerId("");
    setPickupSpot(null);
    setCallahanPlayerId("");
    setInjuredPlayerId("");
  }, [game.id, activePoint?.id, attackingEndzone]);

  useEffect(() => {
    if (game.startingPossession) {
      setSetupPossession(game.startingPossession);
    }
    if (game.startingEndzone) {
      setSetupEndzone(game.startingEndzone);
    }
  }, [game.startingEndzone, game.startingPossession]);

  useEffect(() => {
    if (initialThrowerId && !starterIds.includes(initialThrowerId)) {
      setInitialThrowerId("");
    }
  }, [initialThrowerId, starterIds]);

  useEffect(() => {
    if (activePoint && game.currentPossession === "us" && !game.activeThrowerId && mode === "default") {
      setPickupPlayerId("");
      setPickupSpot(null);
      setMode("pickup");
    }
  }, [activePoint, game.activeThrowerId, game.currentPossession, mode]);

  const playerName = (playerId: Id | null) =>
    players.find((player) => player.id === playerId)?.name ?? "Unassigned";
  const selectedStarterPlayers = availablePlayers.filter((player) => starterIds.includes(player.id));
  const activePointPlayerIds = new Set(pointPlayers.map((item) => item.playerId));

  events
    .filter((event) => event.eventType === "injury")
    .forEach((event) => {
      if (event.playerId) {
        activePointPlayerIds.delete(event.playerId);
      }
      if (event.secondaryPlayerId) {
        activePointPlayerIds.add(event.secondaryPlayerId);
      }
    });

  const activePointPlayers = pointPlayers.filter((item) => activePointPlayerIds.has(item.playerId));
  const starters = activePointPlayers.filter((item) => item.isStarter);
  const subs = activePointPlayers.filter((item) => !item.isStarter);
  const pointPlayerChoices = activePointPlayers
    .map((item) => players.find((player) => player.id === item.playerId))
    .filter((player): player is Player => Boolean(player));
  const gameSetupComplete = Boolean(game.startingPossession && game.startingEndzone);
  const startedOnOffense = game.currentPossession === "us";
  const pointPhaseLabel = startedOnOffense ? "Offense" : "Defense";
  const canStartPoint =
    starterIds.length === 7 && !activePoint && (!startedOnOffense || Boolean(initialThrowerId));
  const canConfirmLine = starterIds.length === 7 && !activePoint;
  const pointHelp =
    availablePlayers.length === 0
      ? "Add players to this tournament roster before starting a point."
      : lineConfirmed && startedOnOffense
        ? "Select who catches or picks up the pull and where the disc starts."
        : "Select exactly seven players for this point.";
  const discSpot =
    game.discX !== null && game.discY !== null
      ? { x: game.discX, y: game.discY }
      : defaultDiscSpotForAttack(attackingEndzone);
  const activeThrowerName = playerName(game.activeThrowerId);
  const passWillScore = passEndSpot ? isGoalSpot(passEndSpot, attackingEndzone) : false;
  const boundaryButtonLabel = game.secondHalfStarted ? "Game Finished" : "Half Time";
  const canUseBoundaryButton = game.secondHalfStarted || currentPointNumber > 1;
  const undoButton = (
    <button className="undo-button" disabled={!latestEvent} onClick={undoLastEvent}>
      Undo
    </button>
  );

  const renderPanel = (children: ReactNode) => (
    <aside className="control-panel">{children}</aside>
  );

  const toggleStarter = (playerId: Id) => {
    setStarterIds((current) => {
      if (current.includes(playerId)) {
        if (initialThrowerId === playerId) {
          setInitialThrowerId("");
        }
        return current.filter((idValue) => idValue !== playerId);
      }

      if (current.length >= 7) {
        return current;
      }

      return [...current, playerId];
    });
  };

  const cancelMode = () => {
    setMode("default");
    setReceiverId("");
    setPassEndSpot(null);
    setPickupPlayerId("");
    setPickupSpot(null);
    setCallahanPlayerId("");
    setInjuredPlayerId("");
  };

  const confirmGameSetup = () => {
    updateGame({
      currentPossession: setupPossession,
      startingPossession: setupPossession,
      startingEndzone: setupEndzone,
      secondHalfStarted: false,
      gameFinished: false,
    });
  };

  const startSecondHalf = () => {
    if (!game.startingPossession || game.secondHalfStarted) return;

    addTimelineEvent("half_time");
    updateGame({
      currentPossession: oppositePossession(game.startingPossession),
      activeThrowerId: null,
      discX: null,
      discY: null,
      secondHalfStarted: true,
    });
    setStarterIds([]);
    setLineConfirmed(false);
    setInitialThrowerId("");
    setInitialSpot(defaultDiscSpotForAttack(attackingEndzone));
  };

  const finishGame = () => {
    addTimelineEvent("full_time");
    updateGame({
      gameFinished: true,
      activeThrowerId: null,
      discX: null,
      discY: null,
    });
    cancelMode();
  };

  const submitBoundaryAction = () => {
    if (game.secondHalfStarted) {
      finishGame();
      return;
    }

    startSecondHalf();
  };

  const confirmLine = () => {
    if (!canConfirmLine) return;

    if (startedOnOffense) {
      setLineConfirmed(true);
      return;
    }

    startPoint(starterIds, false, null, defaultDiscSpotForAttack(attackingEndzone));
  };

  const submitPass = () => {
    if (!game.activeThrowerId || !receiverId || !passEndSpot) return;

    if (passWillScore) {
      finishPoint("us", "pass", game.activeThrowerId, receiverId, {
        start: discSpot,
        end: passEndSpot,
      });
    } else {
      addEvent("pass", game.activeThrowerId, receiverId, {
        start: discSpot,
        end: passEndSpot,
      });
      updateGame({
        activeThrowerId: receiverId,
        discX: passEndSpot.x,
        discY: passEndSpot.y,
      });
    }

    cancelMode();
  };

  const moveToPickup = () => {
    updateGame({
      currentPossession: "us",
      activeThrowerId: null,
      discX: null,
      discY: null,
    });
    setPickupPlayerId("");
    setPickupSpot(null);
    setMode("pickup");
  };

  const submitBlock = () => {
    if (!pickupPlayerId) return;

    addEvent("block", pickupPlayerId);
    moveToPickup();
  };

  const submitOpponentTurnover = () => {
    addEvent("opponent_turnover");
    moveToPickup();
  };

  const submitPickup = () => {
    if (!pickupPlayerId || !pickupSpot) return;

    addEvent("pickup", pickupPlayerId, null, {
      end: pickupSpot,
    });
    updateGame({
      activeThrowerId: pickupPlayerId,
      discX: pickupSpot.x,
      discY: pickupSpot.y,
    });
    cancelMode();
  };

  const giveDiscToOpponent = () => {
    updateGame({
      currentPossession: "opponent",
      activeThrowerId: null,
      discX: null,
      discY: null,
    });
  };

  const submitThrowaway = () => {
    addEvent("throwaway", game.activeThrowerId, null, {
      start: game.activeThrowerId ? discSpot : null,
      end: game.activeThrowerId ? discSpot : null,
    });
    giveDiscToOpponent();
  };

  const submitOpponentBlock = () => {
    addEvent("opponent_block", game.activeThrowerId);
    giveDiscToOpponent();
  };

  const submitDrop = () => {
    if (!receiverId) return;

    addEvent("drop", receiverId, game.activeThrowerId);
    giveDiscToOpponent();
    cancelMode();
  };

  const submitInjury = () => {
    if (!activePoint || !injuredPlayerId || !subPlayerId) return;

    addEvent("injury", injuredPlayerId, subPlayerId);
    addSub(subPlayerId);
    cancelMode();
  };

  if (mode === "pass") {
    return renderPanel(
        <div className="control-section">
          <div className="detail-heading">
            <button className="ghost-button compact-button" onClick={cancelMode}>
              Back
            </button>
            <div>
              <strong>Pass</strong>
              <span>{activeThrowerName} has the disc</span>
            </div>
            {undoButton}
          </div>
          <PlayerButtonGrid
            players={pointPlayerChoices}
            selectedId={receiverId}
            disabledIds={new Set(game.activeThrowerId ? [game.activeThrowerId] : [])}
            lockedIds={new Set(game.activeThrowerId ? [game.activeThrowerId] : [])}
            selectedTone="red"
            onSelect={setReceiverId}
          />
          <FieldPicker
            startSpot={discSpot}
            endSpot={passEndSpot}
            attackingEndzone={attackingEndzone}
            onPick={setPassEndSpot}
          />
          {passWillScore && (
            <div className="goal-notice">
              This reception is in the end zone. Confirming will score a goal.
            </div>
          )}
          <button className="primary-button" disabled={!receiverId || !passEndSpot} onClick={submitPass}>
            Confirm Pass
          </button>
        </div>,
    );
  }

  if (mode === "drop") {
    return renderPanel(
        <div className="control-section">
          <div className="detail-heading">
            <button className="ghost-button compact-button" onClick={cancelMode}>
              Back
            </button>
            <div>
              <strong>Drop</strong>
              <span>{activeThrowerName} threw the pass</span>
            </div>
            {undoButton}
          </div>
          <PlayerButtonGrid
            players={pointPlayerChoices}
            selectedId={receiverId}
            disabledIds={new Set(game.activeThrowerId ? [game.activeThrowerId] : [])}
            onSelect={setReceiverId}
          />
          <button className="primary-button" disabled={!receiverId} onClick={submitDrop}>
            Confirm Drop
          </button>
        </div>,
    );
  }

  if (mode === "block") {
    return renderPanel(
        <div className="control-section">
          <div className="detail-heading">
            <button className="ghost-button compact-button" onClick={cancelMode}>
              Back
            </button>
            <div>
              <strong>Block</strong>
              <span>Set who made the block</span>
            </div>
            {undoButton}
          </div>
          <PlayerButtonGrid
            players={pointPlayerChoices}
            selectedId={pickupPlayerId}
            onSelect={setPickupPlayerId}
          />
          <button
            className="primary-button"
            disabled={!pickupPlayerId}
            onClick={submitBlock}
          >
            Confirm Block
          </button>
        </div>,
    );
  }

  if (mode === "pickup") {
    return renderPanel(
        <div className="control-section">
          <div className="detail-heading">
            <div>
              <strong>Pickup</strong>
              <span>Set who picks up for our offense and where</span>
            </div>
            {undoButton}
          </div>
          <PlayerButtonGrid
            players={pointPlayerChoices}
            selectedId={pickupPlayerId}
            onSelect={setPickupPlayerId}
          />
          <FieldPicker
            endSpot={pickupSpot}
            attackingEndzone={attackingEndzone}
            onPick={setPickupSpot}
          />
          <button
            className="primary-button"
            disabled={!pickupPlayerId || !pickupSpot}
            onClick={submitPickup}
          >
            Confirm Pickup
          </button>
        </div>,
    );
  }

  if (mode === "callahan") {
    return renderPanel(
        <div className="control-section">
          <div className="detail-heading">
            <button className="ghost-button compact-button" onClick={cancelMode}>
              Back
            </button>
            <div>
              <strong>Callahan</strong>
              <span>Select the scoring defender</span>
            </div>
            {undoButton}
          </div>
          <PlayerButtonGrid
            players={pointPlayerChoices}
            selectedId={callahanPlayerId}
            onSelect={setCallahanPlayerId}
          />
          <button
            className="score-button"
            disabled={!callahanPlayerId}
            onClick={() => {
              finishPoint("us", "callahan", callahanPlayerId);
              cancelMode();
            }}
          >
            Confirm Callahan
          </button>
        </div>,
    );
  }

  if (mode === "injury") {
    return renderPanel(
        <div className="control-section">
          <div className="detail-heading">
            <button className="ghost-button compact-button" onClick={cancelMode}>
              Back
            </button>
            <div>
              <strong>Injury</strong>
              <span>Select who comes off and who comes on</span>
            </div>
            {undoButton}
          </div>
          <PlayerButtonGrid
            players={pointPlayerChoices}
            selectedId={injuredPlayerId}
            onSelect={setInjuredPlayerId}
          />
          <select value={subPlayerId} onChange={(event) => setSubPlayerId(event.target.value)}>
            <option value="">Coming on</option>
            {availablePlayers
              .filter((player) => !activePointPlayerIds.has(player.id))
              .map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
          </select>
          <button
            className="primary-button"
            disabled={!injuredPlayerId || !subPlayerId}
            onClick={submitInjury}
          >
            Confirm Injury
          </button>
        </div>,
    );
  }

  return renderPanel(
    <>
      {!activePoint && game.gameFinished ? (
        <div className="control-section game-finished-panel">
          <div className="section-title">
            <div>
              <strong>Game Finished</strong>
              <span>
                Final: Colt {game.ourScore}, {game.opponentName} {game.opponentScore}
              </span>
            </div>
            {undoButton}
          </div>
          <button className="primary-button" onClick={editFinishedGame}>
            Edit Game
          </button>
        </div>
      ) : !activePoint && !gameSetupComplete ? (
        <div className="control-section">
          <div className="section-title">
            <h2>Game Start</h2>
            {undoButton}
          </div>
          <div className="setup-choice">
            <span>Starting Endzone</span>
            <div className="segmented">
              <button
                className={setupEndzone === "left" ? "selected" : ""}
                onClick={() => setSetupEndzone("left")}
              >
                Left
              </button>
              <button
                className={setupEndzone === "right" ? "selected" : ""}
                onClick={() => setSetupEndzone("right")}
              >
                Right
              </button>
            </div>
          </div>
          <div className="setup-choice">
            <span>Point 1</span>
            <div className="segmented">
              <button
                className={setupPossession === "us" ? "selected" : ""}
                onClick={() => setSetupPossession("us")}
              >
                Offense
              </button>
              <button
                className={setupPossession === "opponent" ? "selected" : ""}
                onClick={() => setSetupPossession("opponent")}
              >
                Defense
              </button>
            </div>
          </div>
          <button className="primary-button" onClick={confirmGameSetup}>
            Confirm Game Start
          </button>
        </div>
      ) : !activePoint ? (
        <div className="control-section">
          <div className="section-title">
            <h2>{lineConfirmed && startedOnOffense ? "Disc Start" : "New Point"}</h2>
            <div className="section-actions">
              {!lineConfirmed && (
                <button
                  className="halftime-button"
                  disabled={!canUseBoundaryButton}
                  onClick={submitBoundaryAction}
                >
                  {boundaryButtonLabel}
                </button>
              )}
              {!lineConfirmed && <span>{starterIds.length}/7</span>}
              {undoButton}
            </div>
          </div>
          {!lineConfirmed && (
            <div className="line-preview-row">
              <strong>{pointPhaseLabel}</strong>
              <div className="line-list compact-line-list">
                {selectedStarterPlayers.map((player) => (
                  <span key={player.id}>{player.name}</span>
                ))}
              </div>
            </div>
          )}
          <p className="helper-text">{pointHelp}</p>
          {lineConfirmed && startedOnOffense ? (
            <>
              <PlayerButtonGrid
                players={selectedStarterPlayers}
                selectedId={initialThrowerId}
                onSelect={setInitialThrowerId}
              />
              <FieldPicker
                endSpot={initialSpot}
                attackingEndzone={attackingEndzone}
                onPick={setInitialSpot}
              />
              <button
                className="primary-button"
                disabled={!canStartPoint}
                onClick={() => startPoint(starterIds, true, initialThrowerId, initialSpot)}
              >
                Start Point
              </button>
            </>
          ) : (
            <>
              <PlayerChecklist
                players={availablePlayers}
                selectedIds={new Set(starterIds)}
                togglePlayer={toggleStarter}
              />
              <button
                className="primary-button"
                disabled={!canConfirmLine}
                onClick={confirmLine}
              >
                Confirm Line
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="active-point-top-row">
            <div className="seven-on-row">
              <strong>7-on:</strong>
              <div className="line-list compact-line-list">
                {starters.map((item) => (
                  <span key={item.id}>{playerName(item.playerId)}</span>
                ))}
                {subs.map((item) => (
                  <span className="sub-chip" key={item.id}>
                    {playerName(item.playerId)}
                  </span>
                ))}
              </div>
              <button className="injury-button" onClick={() => setMode("injury")}>
                Injury
              </button>
            </div>
            <div className="disc-inline">
              {game.currentPossession === "us"
                ? `${activeThrowerName} has the disc`
                : "Opponent has the disc"}
            </div>
            {undoButton}
          </div>

          <div className="control-section event-control-section">
            {game.currentPossession === "us" ? (
              <div className="event-button-grid">
                <button
                  className="event-pass"
                  disabled={!game.activeThrowerId}
                  onClick={() => setMode("pass")}
                >
                  Pass
                </button>
                <button
                  className="event-throwaway"
                  disabled={!game.activeThrowerId}
                  onClick={submitThrowaway}
                >
                  Throwaway
                </button>
                <button
                  className="event-drop"
                  disabled={!game.activeThrowerId}
                  onClick={() => setMode("drop")}
                >
                  Drop
                </button>
                <button
                  className="event-opponent-block"
                  disabled={!game.activeThrowerId}
                  onClick={submitOpponentBlock}
                >
                  Opp Block
                </button>
              </div>
            ) : (
              <div className="event-button-grid">
                <button
                  className="danger-button"
                  onClick={() => finishPoint("opponent", "opponent_score")}
                >
                  Opponent Score
                </button>
                <button className="event-def-turnover" onClick={submitOpponentTurnover}>
                  Turnover
                </button>
                <button className="event-block" onClick={() => setMode("block")}>
                  Block
                </button>
                <button className="score-button" onClick={() => setMode("callahan")}>
                  Callahan
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>,
  );
}

function PlayerChecklist({
  players,
  selectedIds,
  togglePlayer,
}: {
  players: Player[];
  selectedIds: Set<Id>;
  togglePlayer: (playerId: Id) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const sortedPlayers = [...players].sort((a, b) => a.name.localeCompare(b.name));
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const searchMatches = normalizedSearch
    ? sortedPlayers.filter(
        (player) =>
          !selectedIds.has(player.id) && player.name.toLowerCase().includes(normalizedSearch),
      )
    : [];
  const topMatch = searchMatches[0];

  const selectSearchMatch = (playerId: Id) => {
    if (selectedIds.size >= 7) return;

    togglePlayer(playerId);
    setSearchTerm("");
  };

  return (
    <div className="player-checklist">
      <div className="player-search">
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (topMatch) {
                selectSearchMatch(topMatch.id);
              }
            }
          }}
          placeholder="Search tournament roster"
        />
        {searchMatches.length > 0 && (
          <div className="player-search-results">
            {searchMatches.map((player) => (
              <button
                type="button"
                key={player.id}
                disabled={selectedIds.size >= 7}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectSearchMatch(player.id)}
              >
                {player.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="player-grid">
        {sortedPlayers.map((player) => (
          <label key={player.id} className={selectedIds.has(player.id) ? "selected" : ""}>
            <input
              type="checkbox"
              checked={selectedIds.has(player.id)}
              onChange={() => togglePlayer(player.id)}
            />
            <span>{player.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function PlayerButtonGrid({
  players,
  selectedId,
  disabledIds = new Set<Id>(),
  lockedIds = new Set<Id>(),
  selectedTone = "blue",
  onSelect,
}: {
  players: Player[];
  selectedId: Id;
  disabledIds?: Set<Id>;
  lockedIds?: Set<Id>;
  selectedTone?: "blue" | "red";
  onSelect: (playerId: Id) => void;
}) {
  return (
    <div className="player-button-grid">
      {players.map((player) => (
        <button
          type="button"
          className={[
            selectedId === player.id ? "selected" : "",
            selectedId === player.id && selectedTone === "red" ? "selected-red" : "",
            lockedIds.has(player.id) ? "locked" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          disabled={disabledIds.has(player.id)}
          key={player.id}
          onClick={() => onSelect(player.id)}
        >
          {player.name}
        </button>
      ))}
    </div>
  );
}

function FieldPicker({
  startSpot,
  endSpot,
  attackingEndzone,
  onPick,
}: {
  startSpot?: FieldCoordinate | null;
  endSpot: FieldCoordinate | null;
  attackingEndzone: EndzoneSide;
  onPick: (spot: FieldCoordinate) => void;
}) {
  const pickSpot = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    onPick({
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    });
  };

  return (
    <div className={`field-picker-shell attack-${attackingEndzone}`}>
      <span className="attack-arrow top" aria-hidden="true" />
      <div
        className="field-picker"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          pickSpot(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            pickSpot(event);
          }
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        role="button"
        tabIndex={0}
      >
        <div className="endzone left" />
        <div className="playing-field" />
        <div className="endzone right" />
        {fieldReferenceMarkers.map((spot) => (
          <span
            aria-hidden="true"
            className="field-reference-marker"
            key={`${spot.x}-${spot.y}`}
            style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }}
          />
        ))}
        {startSpot && (
          <span
            className="field-marker start"
            style={{ left: `${startSpot.x * 100}%`, top: `${startSpot.y * 100}%` }}
          />
        )}
        {endSpot && (
          <span
            className="field-marker end"
            style={{ left: `${endSpot.x * 100}%`, top: `${endSpot.y * 100}%` }}
          />
        )}
      </div>
      <span className="attack-arrow bottom" aria-hidden="true" />
    </div>
  );
}

function EventLog({
  events,
  points,
  players,
  seekVideo,
  deleteEvent,
}: {
  events: Event[];
  points: Point[];
  players: Player[];
  seekVideo: (seconds: number) => void;
  deleteEvent: (eventId: Id) => void;
}) {
  const recentEvents = [...events].sort(compareEventsDescending);
  const playerName = (playerId: Id | null) =>
    players.find((player) => player.id === playerId)?.name ?? "";

  return (
    <div className="event-log">
      <div className="section-title">
        <h2>Event Log</h2>
        <span>{events.length}</span>
      </div>
      {recentEvents.map((event) => {
        const point = points.find((item) => item.id === event.pointId);

        return (
        <div
          className={`event-row ${eventToneClass(event, point)}`}
          key={event.id}
          role="button"
          tabIndex={0}
          onClick={() => seekVideo(event.videoSeconds)}
          onKeyDown={(keyboardEvent) => {
            if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
              keyboardEvent.preventDefault();
              seekVideo(event.videoSeconds);
            }
          }}
        >
          <button
            type="button"
            className="event-delete-button"
            aria-label={`Delete ${labelEvent(event, point)} event at ${formatTimestamp(
              event.videoSeconds,
            )}`}
            onClick={(clickEvent) => {
              clickEvent.stopPropagation();
              deleteEvent(event.id);
            }}
          >
            Delete
          </button>
          <span>{formatTimestamp(event.videoSeconds)}</span>
          <strong>{labelEvent(event, point)}</strong>
          <em>{eventDescription(event, playerName)}</em>
        </div>
        );
      })}
    </div>
  );
}

function eventDescription(event: Event, playerName: (playerId: Id | null) => string) {
  const primary = playerName(event.playerId);
  const secondary = playerName(event.secondaryPlayerId);

  if (event.eventType === "injury") {
    return [primary, secondary].filter(Boolean).join(" off for ");
  }

  if (event.eventType === "drop") {
    return [secondary, primary].filter(Boolean).join(" to ");
  }

  if (event.eventType === "pickup") {
    return primary;
  }

  return [primary, secondary].filter(Boolean).join(" to ");
}

function labelEvent(event: Event, point?: Point) {
  if (event.eventType === "pass" && point?.scoringTeam === "us" && point.status === "complete") {
    return "Score";
  }

  return event.eventType
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function eventToneClass(event: Event, point?: Point) {
  if (event.eventType === "half_time" || event.eventType === "full_time") {
    return "event-timeline";
  }

  if (event.eventType === "opponent_score") {
    return "event-score-opponent";
  }

  if (
    event.eventType === "callahan" ||
    (event.eventType === "pass" && point?.scoringTeam === "us" && point.status === "complete")
  ) {
    return "event-score-us";
  }

  return "";
}

export default App;
