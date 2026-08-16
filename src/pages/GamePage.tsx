import {
  Dispatch,
  MutableRefObject,
  PointerEvent,
  ReactNode,
  SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
} from "../types";
import {
  deleteActiveGamePoint,
  deleteGameEvent,
  finishGamePoint,
  patchGame,
  recordGameEvent,
  startGamePoint,
} from "../lib/api";
import { formatTimestamp, getYouTubeVideoId } from "../youtube";

type DataSetter = Dispatch<SetStateAction<AppData>>;
type ControlMode = "default" | "pass" | "drop" | "block" | "pickup" | "callahan" | "injury";
type PointStartUndoState = {
  starterIds: Id[];
  startedOnOffense: boolean;
  initialThrowerId: Id | null;
  initialSpot: FieldCoordinate | null;
  pullEvent: Event | null;
};

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

const isPointScoreEvent = (event: Event, point: Point | undefined, game: Game) =>
  event.eventType === "opponent_score" ||
  event.eventType === "callahan" ||
  isScoringPassEvent(event, point, game);

const getPointStartUndoState = (
  activePoint: Point | undefined,
  pointPlayers: PointPlayer[],
  pointEvents: Event[],
): PointStartUndoState | null => {
  if (!activePoint) return null;

  const hasChartedEvents = pointEvents.some(
    (event) => event.eventType !== "pull" && !(event.eventType === "catch" && event.fromPull),
  );
  if (hasChartedEvents) return null;

  const starterIds = pointPlayers
    .filter((item) => item.isStarter)
    .map((item) => item.playerId);
  if (starterIds.length !== 7) return null;

  const pullEvent = pointEvents.find((event) => event.eventType === "pull") ?? null;
  return {
    starterIds,
    startedOnOffense: activePoint.startedOnOffense,
    initialThrowerId: activePoint.initialThrowerId,
    initialSpot:
      activePoint.initialDiscX !== null && activePoint.initialDiscY !== null
        ? { x: activePoint.initialDiscX, y: activePoint.initialDiscY }
        : null,
    pullEvent,
  };
};

function isScoringPassEvent(event: Event, point: Point | undefined, game: Game) {
  if (
    event.eventType !== "pass" ||
    !point ||
    point.scoringTeam !== "us" ||
    point.status !== "complete" ||
    event.endX === null ||
    event.endY === null
  ) {
    return false;
  }

  const attackingEndzone = game.startingEndzone
    ? pointAttackingEndzone(game.startingEndzone, point.pointNumber)
    : "right";

  return isGoalSpot({ x: event.endX, y: event.endY }, attackingEndzone);
}

function rebuildActiveGameState(game: Game, activePoint: Point, events: Event[]): Partial<Game> {
  let currentPossession: Possession = activePoint.startedOnOffense ? "us" : "opponent";
  let activeThrowerId = activePoint.startedOnOffense ? activePoint.initialThrowerId : null;
  let discX = activePoint.startedOnOffense ? activePoint.initialDiscX : null;
  let discY = activePoint.startedOnOffense ? activePoint.initialDiscY : null;

  events
    .filter((event) => event.pointId === activePoint.id)
    .sort(compareEventsAscending)
    .forEach((event) => {
      if (event.eventType === "pass" || event.eventType === "catch") {
        currentPossession = "us";
        activeThrowerId = event.eventType === "catch" ? event.playerId : event.secondaryPlayerId;
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

function GamePage({
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
  const [error, setError] = useState("");
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
  const pointPlayers = data.pointPlayers.filter((item) => item.pointId === activePoint?.id);
  const currentPointNumber = activePoint?.pointNumber ?? game.ourScore + game.opponentScore + 1;
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

  const applyDataMutation = async (mutation: () => Promise<{ data: AppData }>) => {
    setError("");

    try {
      const result = await mutation();
      setData(result.data);
      return true;
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to save game data.");
      return false;
    }
  };

  const addEvent = (
    eventType: EventType,
    playerId: Id | null = null,
    secondaryPlayerId: Id | null = null,
    coordinates: {
      start?: FieldCoordinate | null;
      end?: FieldCoordinate | null;
    } = {},
    gamePatch: Partial<Game> = {},
    subPlayerId: Id | null = null,
  ) => {
    if (!activePoint) return Promise.resolve(false);

    return applyDataMutation(() =>
      recordGameEvent({
        gameId: game.id,
        eventType,
        playerId,
        secondaryPlayerId,
        start: coordinates.start ?? null,
        end: coordinates.end ?? null,
        videoSeconds: getVideoSeconds(),
        gamePatch,
        subPlayerId,
      }),
    );
  };

  const addTimelineEvent = (eventType: "half_time" | "full_time", gamePatch: Partial<Game> = {}) => {
    return applyDataMutation(() =>
      recordGameEvent({
        gameId: game.id,
        eventType,
        videoSeconds: getVideoSeconds(),
        gamePatch,
      }),
    );
  };

  const updateGame = (patch: Partial<Game>) => {
    return applyDataMutation(() => patchGame(game.id, patch));
  };

  const startPoint = (
    starterIds: Id[],
    startedOnOffense: boolean,
    initialThrowerId: Id | null,
    initialSpot: FieldCoordinate,
    pullDetails?: {
      pullerId: Id;
      hangTimeSeconds: number;
      landingSpot: FieldCoordinate;
      inBounds: boolean;
      releaseVideoSeconds: number;
    },
  ) => {
    return applyDataMutation(() =>
      startGamePoint({
        gameId: game.id,
        starterIds,
        startedOnOffense,
        initialThrowerId: startedOnOffense ? initialThrowerId : null,
        initialSpot,
        initialCatchVideoSeconds: startedOnOffense ? getVideoSeconds() : undefined,
        pullDetails,
      }),
    );
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
    if (!activePoint) return Promise.resolve(false);

    return applyDataMutation(() =>
      finishGamePoint({
        gameId: game.id,
        scoringTeam,
        eventType,
        playerId,
        secondaryPlayerId,
        start: coordinates.start ?? null,
        end: coordinates.end ?? null,
        videoSeconds: getVideoSeconds(),
      }),
    );
  };

  const removeEvent = (eventId: Id, shouldSeek = true) => {
    const eventToRemove = data.events.find((event) => event.id === eventId);
    if (!eventToRemove) return Promise.resolve(false);

    if (shouldSeek) {
      seekVideo(eventToRemove.videoSeconds);
    }

    return applyDataMutation(() => deleteGameEvent(game.id, eventId));
  };

  const undoLatestEventAtCurrentTimestamp = () => {
    const currentVideoSeconds = getVideoSeconds();
    const eventToUndo = gameEvents
      .filter((event) => event.videoSeconds <= currentVideoSeconds)
      .sort(compareEventsDescending)[0];

    if (!eventToUndo) {
      setError(`No event recorded at or before ${formatTimestamp(currentVideoSeconds)} to undo.`);
      return Promise.resolve(false);
    }

    return removeEvent(eventToUndo.id);
  };

  const undoActivePointStart = () => {
    return applyDataMutation(() => deleteActiveGamePoint(game.id));
  };

  const editFinishedGame = () => {
    const fullTimeEvent = [...gameEvents]
      .filter((event) => event.eventType === "full_time")
      .sort(compareEventsDescending)[0];

    if (fullTimeEvent) {
      void removeEvent(fullTimeEvent.id, false);
      return;
    }

    void updateGame({ gameFinished: false });
  };

  return (
    <section className="charting">
      {error && <p className="status-banner error">{error}</p>}
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
            pointPlayers={pointPlayers}
            events={pointEvents}
            players={data.players}
            latestEvent={latestEvent}
            startPoint={startPoint}
            addEvent={addEvent}
            addTimelineEvent={addTimelineEvent}
            updateGame={updateGame}
            finishPoint={finishPoint}
            undoLatestEventAtCurrentTimestamp={undoLatestEventAtCurrentTimestamp}
            undoActivePointStart={undoActivePointStart}
            editFinishedGame={editFinishedGame}
            getVideoSeconds={getVideoSeconds}
          />
        </div>
        <EventLog
          game={game}
          events={gameEvents}
          points={data.points}
          players={data.players}
          seekVideo={seekVideo}
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerElementId = useMemo(() => `youtube-${id()}`, []);
  const videoId = getYouTubeVideoId(videoUrl);

  useEffect(() => {
    if (!videoId) {
      playerRef.current?.destroy();
      playerRef.current = null;
      return;
    }

    let cancelled = false;
    let previousReady: typeof window.onYouTubeIframeAPIReady | undefined;
    let installedReadyHandler = false;

    const createPlayer = () => {
      if (cancelled || !window.YT?.Player || !containerRef.current) return;

      playerRef.current?.destroy();
      containerRef.current.innerHTML = "";

      const playerElement = document.createElement("div");
      playerElement.id = playerElementId;
      containerRef.current.appendChild(playerElement);

      playerRef.current = new window.YT.Player(playerElementId, {
        height: "100%",
        videoId,
        width: "100%",
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

      previousReady = window.onYouTubeIframeAPIReady;
      installedReadyHandler = true;
      window.onYouTubeIframeAPIReady = () => {
        previousReady?.();
        createPlayer();
      };
    }

    return () => {
      cancelled = true;
      if (installedReadyHandler) {
        window.onYouTubeIframeAPIReady = previousReady;
      }
      playerRef.current?.destroy();
      playerRef.current = null;
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [playerElementId, playerRef, videoId]);

  if (!videoId) {
    return (
      <div className="video-placeholder">
        <span>YouTube URL Required</span>
      </div>
    );
  }

  return <div className="video-frame" ref={containerRef} />;
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
  addEvent,
  addTimelineEvent,
  updateGame,
  finishPoint,
  undoLatestEventAtCurrentTimestamp,
  undoActivePointStart,
  editFinishedGame,
  getVideoSeconds,
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
    pullDetails?: {
      pullerId: Id;
      hangTimeSeconds: number;
      landingSpot: FieldCoordinate;
      inBounds: boolean;
      releaseVideoSeconds: number;
    },
  ) => Promise<boolean>;
  addEvent: (
    eventType: EventType,
    playerId?: Id | null,
    secondaryPlayerId?: Id | null,
    coordinates?: {
      start?: FieldCoordinate | null;
      end?: FieldCoordinate | null;
    },
    gamePatch?: Partial<Game>,
    subPlayerId?: Id | null,
  ) => Promise<boolean>;
  addTimelineEvent: (
    eventType: "half_time" | "full_time",
    gamePatch?: Partial<Game>,
  ) => Promise<boolean>;
  updateGame: (patch: Partial<Game>) => Promise<boolean>;
  finishPoint: (
    scoringTeam: Possession,
    eventType?: EventType,
    playerId?: Id | null,
    secondaryPlayerId?: Id | null,
    coordinates?: {
      start?: FieldCoordinate | null;
      end?: FieldCoordinate | null;
    },
  ) => Promise<boolean>;
  undoLatestEventAtCurrentTimestamp: () => Promise<boolean>;
  undoActivePointStart: () => Promise<boolean>;
  editFinishedGame: () => void;
  getVideoSeconds: () => number;
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
  const [mode, setMode] = useState<ControlMode>("default");
  const [receiverId, setReceiverId] = useState("");
  const [passEndSpot, setPassEndSpot] = useState<FieldCoordinate | null>(null);
  const [pickupPlayerId, setPickupPlayerId] = useState("");
  const [pickupSpot, setPickupSpot] = useState<FieldCoordinate | null>(null);
  const [callahanPlayerId, setCallahanPlayerId] = useState("");
  const [injuredPlayerId, setInjuredPlayerId] = useState("");
  const [defenseSetupStep, setDefenseSetupStep] = useState<"timer" | "landing">("timer");
  const [pullerId, setPullerId] = useState("");
  const [pullTimerStatus, setPullTimerStatus] = useState<"idle" | "running" | "stopped">("idle");
  const [pullStartedAt, setPullStartedAt] = useState<number | null>(null);
  const [pullElapsedSeconds, setPullElapsedSeconds] = useState(0);
  const [pullReleaseVideoSeconds, setPullReleaseVideoSeconds] = useState(0);
  const [pullLandingSpot, setPullLandingSpot] = useState<FieldCoordinate | null>(null);
  const [pullInBounds, setPullInBounds] = useState(true);
  const skipNextSetupResetRef = useRef(false);

  useEffect(() => {
    if (skipNextSetupResetRef.current) {
      skipNextSetupResetRef.current = false;
      return;
    }

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
    setDefenseSetupStep("timer");
    setPullerId("");
    setPullTimerStatus("idle");
    setPullStartedAt(null);
    setPullElapsedSeconds(0);
    setPullReleaseVideoSeconds(0);
    setPullLandingSpot(null);
    setPullInBounds(true);
  }, [game.id, activePoint?.id, attackingEndzone]);

  useEffect(() => {
    if (pullTimerStatus !== "running" || pullStartedAt === null) return;

    const intervalId = window.setInterval(() => {
      setPullElapsedSeconds((performance.now() - pullStartedAt) / 1000);
    }, 10);

    return () => window.clearInterval(intervalId);
  }, [pullStartedAt, pullTimerStatus]);

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

  const latestPointEvent = useMemo(
    () => [...events].sort(compareEventsDescending)[0],
    [events],
  );
  const needsPickupPrompt = Boolean(
    activePoint &&
      game.currentPossession === "us" &&
      !game.activeThrowerId &&
      latestPointEvent &&
      (latestPointEvent.eventType === "block" ||
        latestPointEvent.eventType === "opponent_turnover"),
  );

  useEffect(() => {
    if (!activePoint) return;

    if (needsPickupPrompt && mode === "default") {
      setPickupPlayerId("");
      setPickupSpot(null);
      setMode("pickup");
      return;
    }

    if (!needsPickupPrompt && mode === "pickup") {
      setPickupPlayerId("");
      setPickupSpot(null);
      setMode("default");
    }
  }, [activePoint, mode, needsPickupPrompt]);

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
  const eligibleSubPlayers = availablePlayers.filter((player) => !activePointPlayerIds.has(player.id));
  const eligibleSubPlayerIds = new Set(eligibleSubPlayers.map((player) => player.id));
  const canSubmitInjury =
    Boolean(activePoint && injuredPlayerId && subPlayerId) && eligibleSubPlayerIds.has(subPlayerId);

  useEffect(() => {
    if (subPlayerId && !eligibleSubPlayerIds.has(subPlayerId)) {
      setSubPlayerId("");
    }
  }, [eligibleSubPlayerIds, subPlayerId]);
  const gameSetupComplete = Boolean(game.startingPossession && game.startingEndzone);
  const startedOnOffense = game.currentPossession === "us";
  const pointPhaseLabel = startedOnOffense ? "Offense" : "Defense";
  const canStartPoint =
    starterIds.length === 7 && !activePoint && (!startedOnOffense || Boolean(initialThrowerId));
  const canConfirmLine = starterIds.length === 7 && !activePoint;
  const pointSetupTitle =
    lineConfirmed && startedOnOffense
      ? "Disc Start"
      : lineConfirmed && !startedOnOffense && defenseSetupStep === "timer"
        ? "Pull Hang Time"
        : lineConfirmed && !startedOnOffense
          ? "Pull Landing"
          : "New Point";
  const pointHelp =
    availablePlayers.length === 0
      ? "Add players to this tournament roster before starting a point."
      : lineConfirmed && startedOnOffense
        ? "Select who catches or picks up the pull and where the disc starts."
        : lineConfirmed && !startedOnOffense && defenseSetupStep === "timer"
          ? "Select the puller, start the timer on release, and stop it when the pull lands."
          : lineConfirmed && !startedOnOffense
            ? "Select where the pull landed. If out of bounds, place the marker where the disc went out and select the checkbox."
        : "Select exactly seven players for this point.";
  const discSpot =
    game.discX !== null && game.discY !== null
      ? { x: game.discX, y: game.discY }
      : defaultDiscSpotForAttack(attackingEndzone);
  const activeThrowerName = playerName(game.activeThrowerId);
  const passWillScore = passEndSpot ? isGoalSpot(passEndSpot, attackingEndzone) : false;
  const boundaryButtonLabel = game.secondHalfStarted ? "Game Finished" : "Half Time";
  const canUseBoundaryButton = game.secondHalfStarted || currentPointNumber > 1;
  const pointStartUndoState = getPointStartUndoState(activePoint, pointPlayers, events);
  const canUndo = Boolean(pointStartUndoState || latestEvent);

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
    setSubPlayerId("");
  };

  const resetPullSetup = () => {
    setDefenseSetupStep("timer");
    setPullerId("");
    setPullTimerStatus("idle");
    setPullStartedAt(null);
    setPullElapsedSeconds(0);
    setPullReleaseVideoSeconds(0);
    setPullLandingSpot(null);
    setPullInBounds(true);
  };

  const backToLineSelection = () => {
    setLineConfirmed(false);
    setInitialThrowerId("");
    setInitialSpot(defaultDiscSpotForAttack(attackingEndzone));
    resetPullSetup();
  };

  const restorePointStartSetup = (snapshot: PointStartUndoState) => {
    const pullEvent = snapshot.pullEvent;
    const pullLandingSpot =
      pullEvent && pullEvent.endX !== null && pullEvent.endY !== null
        ? { x: pullEvent.endX, y: pullEvent.endY }
        : null;

    setStarterIds(snapshot.starterIds);
    setLineConfirmed(true);
    cancelMode();

    if (snapshot.startedOnOffense) {
      setInitialThrowerId(snapshot.initialThrowerId ?? "");
      setInitialSpot(snapshot.initialSpot ?? defaultDiscSpotForAttack(attackingEndzone));
      resetPullSetup();
      return;
    }

    setInitialThrowerId("");
    setInitialSpot(defaultDiscSpotForAttack(attackingEndzone));
    setDefenseSetupStep(pullEvent ? "landing" : "timer");
    setPullerId(pullEvent?.playerId ?? "");
    setPullTimerStatus(pullEvent ? "stopped" : "idle");
    setPullStartedAt(null);
    setPullElapsedSeconds(pullEvent?.pullHangTimeSeconds ?? 0);
    setPullReleaseVideoSeconds(pullEvent?.videoSeconds ?? 0);
    setPullLandingSpot(pullLandingSpot);
    setPullInBounds(pullEvent?.pullInBounds ?? true);
  };

  const undoPointStart = () => {
    if (!pointStartUndoState) return;

    const snapshot = pointStartUndoState;
    skipNextSetupResetRef.current = true;
    void undoActivePointStart().then((saved) => {
      if (saved) {
        restorePointStartSetup(snapshot);
        return;
      }

      skipNextSetupResetRef.current = false;
    });
  };

  const handleUndo = () => {
    if (pointStartUndoState) {
      undoPointStart();
      return;
    }

    void undoLatestEventAtCurrentTimestamp();
  };

  const undoButton = (
    <button className="undo-button" disabled={!canUndo} onClick={handleUndo}>
      Undo
    </button>
  );

  const confirmGameSetup = () => {
    void updateGame({
      currentPossession: setupPossession,
      startingPossession: setupPossession,
      startingEndzone: setupEndzone,
      secondHalfStarted: false,
      gameFinished: false,
    });
  };

  const startSecondHalf = () => {
    if (!game.startingPossession || game.secondHalfStarted) return;

    void addTimelineEvent("half_time", {
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
    void addTimelineEvent("full_time", {
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

    setLineConfirmed(true);
    setDefenseSetupStep("timer");
  };

  const releasePull = () => {
    if (!pullerId) return;

    setPullReleaseVideoSeconds(getVideoSeconds());
    setPullElapsedSeconds(0);
    setPullStartedAt(performance.now());
    setPullTimerStatus("running");
  };

  const landPull = () => {
    if (pullTimerStatus !== "running" || pullStartedAt === null) return;

    setPullElapsedSeconds((performance.now() - pullStartedAt) / 1000);
    setPullTimerStatus("stopped");
    setPullStartedAt(null);
  };

  const redoPullTimer = () => {
    setPullTimerStatus("idle");
    setPullStartedAt(null);
    setPullElapsedSeconds(0);
    setPullReleaseVideoSeconds(0);
  };

  const confirmPullTimer = () => {
    if (pullTimerStatus !== "stopped") return;

    setDefenseSetupStep("landing");
    setPullLandingSpot(null);
    setPullInBounds(true);
  };

  const confirmDefensivePull = () => {
    if (!pullerId || !pullLandingSpot) return;

    void startPoint(starterIds, false, null, defaultDiscSpotForAttack(attackingEndzone), {
      pullerId,
      hangTimeSeconds: Math.round(pullElapsedSeconds * 100) / 100,
      landingSpot: pullLandingSpot,
      inBounds: pullInBounds,
      releaseVideoSeconds: pullReleaseVideoSeconds,
    });
  };

  const submitPass = () => {
    if (!game.activeThrowerId || !receiverId || !passEndSpot) return;

    void (async () => {
      const saved = passWillScore
        ? await finishPoint("us", "pass", game.activeThrowerId, receiverId, {
            start: discSpot,
            end: passEndSpot,
          })
        : await addEvent(
            "pass",
            game.activeThrowerId,
            receiverId,
            {
              start: discSpot,
              end: passEndSpot,
            },
            {
              activeThrowerId: receiverId,
              discX: passEndSpot.x,
              discY: passEndSpot.y,
            },
          );

      if (saved) {
        cancelMode();
      }
    })();
  };

  const moveToPickup = () => {
    setPickupPlayerId("");
    setPickupSpot(null);
    setMode("pickup");
  };

  const submitBlock = () => {
    if (!pickupPlayerId) return;

    void (async () => {
      const saved = await addEvent("block", pickupPlayerId, null, {}, {
        currentPossession: "us",
        activeThrowerId: null,
        discX: null,
        discY: null,
      });

      if (saved) {
        moveToPickup();
      }
    })();
  };

  const submitOpponentTurnover = () => {
    void (async () => {
      const saved = await addEvent("opponent_turnover", null, null, {}, {
        currentPossession: "us",
        activeThrowerId: null,
        discX: null,
        discY: null,
      });

      if (saved) {
        moveToPickup();
      }
    })();
  };

  const submitPickup = () => {
    if (!pickupPlayerId || !pickupSpot) return;

    void (async () => {
      const saved = await addEvent(
        "pickup",
        pickupPlayerId,
        null,
        {
          end: pickupSpot,
        },
        {
          activeThrowerId: pickupPlayerId,
          discX: pickupSpot.x,
          discY: pickupSpot.y,
        },
      );

      if (saved) {
        cancelMode();
      }
    })();
  };

  const opponentPossessionPatch: Partial<Game> = {
      currentPossession: "opponent",
      activeThrowerId: null,
      discX: null,
      discY: null,
  };

  const submitThrowaway = () => {
    void addEvent("throwaway", game.activeThrowerId, null, {
      start: game.activeThrowerId ? discSpot : null,
      end: game.activeThrowerId ? discSpot : null,
    }, opponentPossessionPatch);
  };

  const submitOpponentBlock = () => {
    void addEvent("opponent_block", game.activeThrowerId, null, {}, opponentPossessionPatch);
  };

  const submitDrop = () => {
    if (!receiverId) return;

    void addEvent("drop", receiverId, game.activeThrowerId, {}, opponentPossessionPatch).then(
      (saved) => {
        if (saved) {
          cancelMode();
        }
      },
    );
  };

  const submitInjury = () => {
    if (!canSubmitInjury) return;

    void addEvent(
      "injury",
      injuredPlayerId,
      subPlayerId,
      {},
      game.activeThrowerId === injuredPlayerId ? { activeThrowerId: subPlayerId } : {},
      subPlayerId,
    ).then((saved) => {
      if (saved) {
        cancelMode();
      }
    });
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
              void finishPoint("us", "callahan", callahanPlayerId).then((saved) => {
                if (saved) {
                  cancelMode();
                }
              });
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
          </div>
          <PlayerButtonGrid
            players={pointPlayerChoices}
            selectedId={injuredPlayerId}
            onSelect={setInjuredPlayerId}
          />
          <select value={subPlayerId} onChange={(event) => setSubPlayerId(event.target.value)}>
            <option value="">Coming on</option>
            {eligibleSubPlayers.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>
          <button
            className="primary-button"
            disabled={!canSubmitInjury}
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
          </div>
          <button className="primary-button" onClick={editFinishedGame}>
            Edit Game
          </button>
        </div>
      ) : !activePoint && !gameSetupComplete ? (
        <div className="control-section">
          <div className="section-title">
            <h2>Game Start</h2>
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
            <div className="setup-step-title">
              {lineConfirmed && (
                <button className="ghost-button compact-button" onClick={backToLineSelection}>
                  Back
                </button>
              )}
              <h2>{pointSetupTitle}</h2>
            </div>
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
              {!lineConfirmed && undoButton}
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
                onClick={() => {
                  void startPoint(starterIds, true, initialThrowerId, initialSpot);
                }}
              >
                Start Point
              </button>
            </>
          ) : lineConfirmed && !startedOnOffense && defenseSetupStep === "timer" ? (
            <>
              <PlayerButtonGrid
                players={selectedStarterPlayers}
                selectedId={pullerId}
                onSelect={setPullerId}
              />
              <div className="pull-timer-panel">
                <strong>{pullElapsedSeconds.toFixed(2)}</strong>
                <span>Hang time</span>
              </div>
              {pullTimerStatus === "stopped" ? (
                <div className="button-grid">
                  <button className="ghost-button" onClick={redoPullTimer}>
                    Redo
                  </button>
                  <button className="primary-button" onClick={confirmPullTimer}>
                    Confirm Time
                  </button>
                </div>
              ) : (
                <button
                  className="primary-button"
                  disabled={!pullerId}
                  onClick={pullTimerStatus === "running" ? landPull : releasePull}
                >
                  {pullTimerStatus === "running" ? "Pull Landed" : "Pull Released"}
                </button>
              )}
            </>
          ) : lineConfirmed && !startedOnOffense ? (
            <>
              <FieldPicker
                endSpot={pullLandingSpot}
                attackingEndzone={attackingEndzone}
                onPick={setPullLandingSpot}
              />
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={!pullInBounds}
                  onChange={(event) => setPullInBounds(!event.target.checked)}
                />
                <span>Out of bounds</span>
              </label>
              <button
                className="primary-button"
                disabled={!pullLandingSpot}
                onClick={confirmDefensivePull}
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
                  onClick={() => {
                    void finishPoint("opponent", "opponent_score");
                  }}
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
  game,
  events,
  points,
  players,
  seekVideo,
}: {
  game: Game;
  events: Event[];
  points: Point[];
  players: Player[];
  seekVideo: (seconds: number) => void;
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
          className={`event-row ${eventToneClass(event, point, game)}`}
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
          <span>{formatTimestamp(event.videoSeconds)}</span>
          <strong>{labelEvent(event, point, game)}</strong>
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

  if (event.eventType === "catch") {
    return primary;
  }

  if (event.eventType === "pull") {
    const hangTime =
      event.pullHangTimeSeconds === null ? "" : `${event.pullHangTimeSeconds.toFixed(2)}s`;
    const bounds = event.pullInBounds === false ? "out of bounds" : "in bounds";

    return [primary, hangTime, bounds].filter(Boolean).join(" · ");
  }

  return [primary, secondary].filter(Boolean).join(" to ");
}

function labelEvent(event: Event, point: Point | undefined, game: Game) {
  if (isScoringPassEvent(event, point, game)) {
    return "Score";
  }

  if (event.eventType === "catch" && event.fromPull) {
    return "Pull Catch";
  }

  return event.eventType
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function eventToneClass(event: Event, point: Point | undefined, game: Game) {
  if (event.eventType === "half_time" || event.eventType === "full_time") {
    return "event-timeline";
  }

  if (event.eventType === "opponent_score") {
    return "event-score-opponent";
  }

  if (
    event.eventType === "callahan" ||
    isScoringPassEvent(event, point, game)
  ) {
    return "event-score-us";
  }

  return "";
}

export default GamePage;
