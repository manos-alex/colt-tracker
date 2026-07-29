import {
  Dispatch,
  FormEvent,
  MutableRefObject,
  MouseEvent,
  SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { emptyData, loadData, saveData } from "./storage";
import type {
  AppData,
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
const isGoalSpot = (spot: FieldCoordinate) => spot.x >= 90 / 110;

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

  const getVideoSeconds = () => Math.floor(playerRef.current?.getCurrentTime() ?? 0);

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

  return (
    <section className="charting">
      <ScoreBar game={game} activePoint={activePoint} pointNumber={currentPointNumber} />
      <div className="charting-grid">
        <div className="charting-primary">
          <YouTubeEmbed videoUrl={game.videoUrl} playerRef={playerRef} />
          <ControlPanel
            game={game}
            activePoint={activePoint}
            availablePlayers={availablePlayers}
            pointPlayers={data.pointPlayers.filter((item) => item.pointId === activePoint?.id)}
            events={pointEvents}
            players={data.players}
            startPoint={startPoint}
            addSub={addSub}
            addEvent={addEvent}
            updateGame={updateGame}
            finishPoint={finishPoint}
          />
        </div>
        <EventLog events={gameEvents} players={data.players} />
      </div>
    </section>
  );
}

function ScoreBar({
  game,
  activePoint,
  pointNumber,
}: {
  game: Game;
  activePoint: Point | undefined;
  pointNumber: number;
}) {
  const startingPossession = activePoint
    ? activePoint.startedOnOffense
      ? "us"
      : "opponent"
    : game.currentPossession;

  return (
    <div className="score-bar">
      <ScoreTeam
        label="Us"
        score={game.ourScore}
        active={startingPossession === "us"}
        tone="blue"
        side="left"
      />
      <div className="point-pill">Point {pointNumber}</div>
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
  availablePlayers,
  pointPlayers,
  events,
  players,
  startPoint,
  addSub,
  addEvent,
  updateGame,
  finishPoint,
}: {
  game: Game;
  activePoint: Point | undefined;
  availablePlayers: Player[];
  pointPlayers: PointPlayer[];
  events: Event[];
  players: Player[];
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
}) {
  const [starterIds, setStarterIds] = useState<Id[]>([]);
  const [startedOnOffense, setStartedOnOffense] = useState(true);
  const [lineConfirmed, setLineConfirmed] = useState(false);
  const [initialThrowerId, setInitialThrowerId] = useState("");
  const [initialSpot, setInitialSpot] = useState<FieldCoordinate>(defaultDiscSpot);
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
    setMode("default");
    setReceiverId("");
    setPassEndSpot(null);
    setPickupPlayerId("");
    setPickupSpot(null);
    setCallahanPlayerId("");
    setInjuredPlayerId("");
  }, [game.id, activePoint?.id]);

  useEffect(() => {
    if (!activePoint) {
      setStartedOnOffense(game.currentPossession === "us");
    }
  }, [activePoint, game.currentPossession]);

  useEffect(() => {
    if (initialThrowerId && !starterIds.includes(initialThrowerId)) {
      setInitialThrowerId("");
    }
  }, [initialThrowerId, starterIds]);

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
      : defaultDiscSpot;
  const activeThrowerName = playerName(game.activeThrowerId);
  const passWillScore = passEndSpot ? isGoalSpot(passEndSpot) : false;

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

  const confirmLine = () => {
    if (!canConfirmLine) return;

    if (startedOnOffense) {
      setLineConfirmed(true);
      return;
    }

    startPoint(starterIds, false, null, defaultDiscSpot);
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
    return (
      <aside className="control-panel">
        <div className="control-section">
          <div className="detail-heading">
            <button className="ghost-button compact-button" onClick={cancelMode}>
              Back
            </button>
            <div>
              <strong>Pass</strong>
              <span>{activeThrowerName} has the disc</span>
            </div>
          </div>
          <PlayerButtonGrid
            players={pointPlayerChoices}
            selectedId={receiverId}
            onSelect={setReceiverId}
          />
          <FieldPicker
            startSpot={discSpot}
            endSpot={passEndSpot}
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
        </div>
      </aside>
    );
  }

  if (mode === "drop") {
    return (
      <aside className="control-panel">
        <div className="control-section">
          <div className="detail-heading">
            <button className="ghost-button compact-button" onClick={cancelMode}>
              Back
            </button>
            <div>
              <strong>Drop</strong>
              <span>{activeThrowerName} threw the pass</span>
            </div>
          </div>
          <PlayerButtonGrid
            players={pointPlayerChoices}
            selectedId={receiverId}
            onSelect={setReceiverId}
          />
          <button className="primary-button" disabled={!receiverId} onClick={submitDrop}>
            Confirm Drop
          </button>
        </div>
      </aside>
    );
  }

  if (mode === "block") {
    return (
      <aside className="control-panel">
        <div className="control-section">
          <div className="detail-heading">
            <button className="ghost-button compact-button" onClick={cancelMode}>
              Back
            </button>
            <div>
              <strong>Block</strong>
              <span>Set who made the block</span>
            </div>
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
        </div>
      </aside>
    );
  }

  if (mode === "pickup") {
    return (
      <aside className="control-panel">
        <div className="control-section">
          <div className="detail-heading">
            <button className="ghost-button compact-button" onClick={cancelMode}>
              Back
            </button>
            <div>
              <strong>Pickup</strong>
              <span>Set who picks up for our offense and where</span>
            </div>
          </div>
          <PlayerButtonGrid
            players={pointPlayerChoices}
            selectedId={pickupPlayerId}
            onSelect={setPickupPlayerId}
          />
          <FieldPicker endSpot={pickupSpot} onPick={setPickupSpot} />
          <button
            className="primary-button"
            disabled={!pickupPlayerId || !pickupSpot}
            onClick={submitPickup}
          >
            Confirm Pickup
          </button>
        </div>
      </aside>
    );
  }

  if (mode === "callahan") {
    return (
      <aside className="control-panel">
        <div className="control-section">
          <div className="detail-heading">
            <button className="ghost-button compact-button" onClick={cancelMode}>
              Back
            </button>
            <div>
              <strong>Callahan</strong>
              <span>Select the scoring defender</span>
            </div>
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
        </div>
      </aside>
    );
  }

  if (mode === "injury") {
    return (
      <aside className="control-panel">
        <div className="control-section">
          <div className="detail-heading">
            <button className="ghost-button compact-button" onClick={cancelMode}>
              Back
            </button>
            <div>
              <strong>Injury</strong>
              <span>Select who comes off and who comes on</span>
            </div>
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
        </div>
      </aside>
    );
  }

  return (
    <aside className="control-panel">
      {!activePoint ? (
        <div className="control-section">
          <div className="section-title">
            <h2>{lineConfirmed && startedOnOffense ? "Disc Start" : "New Point"}</h2>
            <span>{starterIds.length}/7</span>
          </div>
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
              <div className="segmented">
                <button
                  className={startedOnOffense ? "selected" : ""}
                  onClick={() => setStartedOnOffense(true)}
                >
                  Offense
                </button>
                <button
                  className={!startedOnOffense ? "selected" : ""}
                  onClick={() => setStartedOnOffense(false)}
                >
                  Defense
                </button>
              </div>
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
    </aside>
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
  return (
    <div className="player-grid">
      {players.map((player) => (
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
  );
}

function PlayerButtonGrid({
  players,
  selectedId,
  onSelect,
}: {
  players: Player[];
  selectedId: Id;
  onSelect: (playerId: Id) => void;
}) {
  return (
    <div className="player-button-grid">
      {players.map((player) => (
        <button
          type="button"
          className={selectedId === player.id ? "selected" : ""}
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
  onPick,
}: {
  startSpot?: FieldCoordinate | null;
  endSpot: FieldCoordinate | null;
  onPick: (spot: FieldCoordinate) => void;
}) {
  const pickSpot = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    onPick({
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    });
  };

  return (
    <div className="field-picker" onClick={pickSpot} role="button" tabIndex={0}>
      <div className="endzone left" />
      <div className="playing-field" />
      <div className="endzone right" />
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
  );
}

function EventLog({ events, players }: { events: Event[]; players: Player[] }) {
  const recentEvents = [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const playerName = (playerId: Id | null) =>
    players.find((player) => player.id === playerId)?.name ?? "";

  return (
    <div className="event-log">
      <div className="section-title">
        <h2>Event Log</h2>
        <span>{events.length}</span>
      </div>
      {recentEvents.map((event) => (
        <div className="event-row" key={event.id}>
          <span>{formatTimestamp(event.videoSeconds)}</span>
          <strong>{labelEvent(event.eventType)}</strong>
          <em>
            {[playerName(event.playerId), playerName(event.secondaryPlayerId)]
              .filter(Boolean)
              .join(" to ")}
          </em>
        </div>
      ))}
    </div>
  );
}

function labelEvent(eventType: EventType) {
  return eventType
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export default App;
