import { Dispatch, FormEvent, SetStateAction, useState } from "react";
import { paths } from "../lib/routes";
import type { AppData, Game, Id, Tournament, TournamentPlayer, TournamentScheduleItem } from "../types";

type DataSetter = Dispatch<SetStateAction<AppData>>;

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

function TournamentPage({
  data,
  tournament,
  setData,
  navigate,
}: {
  data: AppData;
  tournament: Tournament;
  setData: DataSetter;
  navigate: (path: string) => void;
}) {
  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Tournament</p>
          <h1>{tournament.name}</h1>
        </div>
        <button className="ghost-button" onClick={() => navigate(paths.tournaments)}>
          All Tournaments
        </button>
      </div>

      <div className="data-entry-grid">
        <TournamentRosterPanel data={data} tournament={tournament} setData={setData} />
        <TournamentGamesPanel
          data={data}
          tournament={tournament}
          setData={setData}
          navigate={navigate}
        />
      </div>
    </section>
  );
}

function TournamentRosterPanel({
  data,
  tournament,
  setData,
}: {
  data: AppData;
  tournament: Tournament;
  setData: DataSetter;
}) {
  const selectedPlayers = new Set(
    data.tournamentPlayers
      .filter((item) => item.tournamentId === tournament.id)
      .map((item) => item.playerId),
  );

  const toggleTournamentPlayer = (playerId: Id) => {
    setData((current) => {
      const existing = current.tournamentPlayers.find(
        (item) => item.tournamentId === tournament.id && item.playerId === playerId,
      );

      if (existing) {
        return {
          ...current,
          tournamentPlayers: current.tournamentPlayers.filter((item) => item.id !== existing.id),
        };
      }

      const tournamentPlayer: TournamentPlayer = {
        id: id(),
        tournamentId: tournament.id,
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
    const rosteredSelections = data.players
      .filter((player) => player.rosterPlayer)
      .map<TournamentPlayer>((player) => ({
        id: id(),
        tournamentId: tournament.id,
        playerId: player.id,
        createdAt: now(),
      }));

    setData((current) => ({
      ...current,
      tournamentPlayers: [
        ...current.tournamentPlayers.filter((item) => item.tournamentId !== tournament.id),
        ...rosteredSelections,
      ],
    }));
  };

  return (
    <section className="wide-panel">
      <div className="detail-heading">
        <div>
          <strong>{tournament.name}</strong>
          <span>{tournament.location || "No location"}</span>
        </div>
      </div>
      <div className="section-title">
        <h2>Tournament Roster</h2>
        <button className="ghost-button compact-button" onClick={selectRosteredPlayers}>
          Select Rostered
        </button>
      </div>
      <div className="checklist tall">
        {data.players.map((player) => (
          <label key={player.id}>
            <input
              type="checkbox"
              checked={selectedPlayers.has(player.id)}
              onChange={() => toggleTournamentPlayer(player.id)}
            />
            <span>{player.name}</span>
            <em>{player.rosterPlayer ? "Rostered" : "Non-rostered"}</em>
          </label>
        ))}
      </div>
    </section>
  );
}

function TournamentGamesPanel({
  data,
  tournament,
  setData,
  navigate,
}: {
  data: AppData;
  tournament: Tournament;
  setData: DataSetter;
  navigate: (path: string) => void;
}) {
  const [opponentName, setOpponentName] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [addingGameDay, setAddingGameDay] = useState<number | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<Id | null>(null);
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);

  const scheduleItems = data.tournamentScheduleItems
    .filter((item) => item.tournamentId === tournament.id)
    .sort((a, b) => a.dayNumber - b.dayNumber || a.sortOrder - b.sortOrder);
  const dayCount = Math.max(1, tournament.dayCount, ...scheduleItems.map((item) => item.dayNumber));
  const tournamentGames = data.games.filter((game) => game.tournamentId === tournament.id);
  const days = Array.from({ length: dayCount }, (_, index) => index + 1);

  const nextSortOrderForDay = (dayNumber: number, items = scheduleItems) => {
    const dayItems = items.filter((item) => item.dayNumber === dayNumber);
    return dayItems.length ? Math.max(...dayItems.map((item) => item.sortOrder)) + 1 : 0;
  };

  const addGame = (event: FormEvent) => {
    event.preventDefault();
    if (!opponentName.trim() || addingGameDay === null) return;

    const timestamp = now();
    const game: Game = {
      id: id(),
      tournamentId: tournament.id,
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
    const scheduleItem: TournamentScheduleItem = {
      id: id(),
      tournamentId: tournament.id,
      type: "game",
      gameId: game.id,
      label: null,
      dayNumber: addingGameDay,
      sortOrder: nextSortOrderForDay(addingGameDay),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    setData((current) => ({
      ...current,
      games: [...current.games, game],
      tournamentScheduleItems: [...current.tournamentScheduleItems, scheduleItem],
    }));
    setOpponentName("");
    setVideoUrl("");
    setAddingGameDay(null);
    navigate(paths.game(game.id));
  };

  const cancelAddGame = () => {
    setOpponentName("");
    setVideoUrl("");
    setAddingGameDay(null);
  };

  const addBye = (dayNumber: number) => {
    const timestamp = now();
    const scheduleItem: TournamentScheduleItem = {
      id: id(),
      tournamentId: tournament.id,
      type: "bye",
      gameId: null,
      label: "Bye",
      dayNumber,
      sortOrder: nextSortOrderForDay(dayNumber),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    setData((current) => ({
      ...current,
      tournamentScheduleItems: [...current.tournamentScheduleItems, scheduleItem],
    }));
  };

  const addDay = () => {
    setData((current) => ({
      ...current,
      tournaments: current.tournaments.map((item) =>
        item.id === tournament.id
          ? { ...item, dayCount: dayCount + 1, updatedAt: now() }
          : item,
      ),
    }));
  };

  const moveScheduleItem = (draggedId: Id, targetDay: number, targetIndex: number) => {
    setData((current) => {
      const tournamentItems = current.tournamentScheduleItems
        .filter((item) => item.tournamentId === tournament.id)
        .sort((a, b) => a.dayNumber - b.dayNumber || a.sortOrder - b.sortOrder);
      const draggedItem = tournamentItems.find((item) => item.id === draggedId);
      if (!draggedItem) return current;

      const remainingItems = tournamentItems.filter((item) => item.id !== draggedId);
      const dayItems = remainingItems.filter((item) => item.dayNumber === targetDay);
      const insertIndex = Math.min(Math.max(targetIndex, 0), dayItems.length);
      const reorderedDayItems = [
        ...dayItems.slice(0, insertIndex),
        { ...draggedItem, dayNumber: targetDay },
        ...dayItems.slice(insertIndex),
      ].map((item, index) => ({ ...item, sortOrder: index, updatedAt: now() }));
      const untouchedItems = remainingItems.filter((item) => item.dayNumber !== targetDay);
      const daySortCounters = new Map<number, number>();
      const nextTournamentItems = [...untouchedItems, ...reorderedDayItems]
        .sort((a, b) => a.dayNumber - b.dayNumber || a.sortOrder - b.sortOrder)
        .map((item) => {
          const nextSortOrder = daySortCounters.get(item.dayNumber) ?? 0;
          daySortCounters.set(item.dayNumber, nextSortOrder + 1);

          return { ...item, sortOrder: nextSortOrder };
        });

      return {
        ...current,
        tournamentScheduleItems: [
          ...current.tournamentScheduleItems.filter((item) => item.tournamentId !== tournament.id),
          ...nextTournamentItems,
        ],
      };
    });
  };

  const removeScheduleItem = (scheduleItem: TournamentScheduleItem) => {
    setData((current) => {
      const gameId = scheduleItem.gameId;
      const removedGamePointIds = gameId
        ? current.points.filter((point) => point.gameId === gameId).map((point) => point.id)
        : [];

      return {
        ...current,
        tournamentScheduleItems: current.tournamentScheduleItems.filter(
          (item) => item.id !== scheduleItem.id,
        ),
        games: gameId ? current.games.filter((game) => game.id !== gameId) : current.games,
        points: gameId ? current.points.filter((point) => point.gameId !== gameId) : current.points,
        pointPlayers: gameId
          ? current.pointPlayers.filter((item) => !removedGamePointIds.includes(item.pointId))
          : current.pointPlayers,
        events: gameId ? current.events.filter((event) => event.gameId !== gameId) : current.events,
      };
    });
  };

  const removeDay = (dayNumber: number) => {
    const dayItems = scheduleItems.filter((item) => item.dayNumber === dayNumber);
    if (dayItems.length > 0 || dayCount <= 1) return;

    setData((current) => ({
      ...current,
      tournaments: current.tournaments.map((item) =>
        item.id === tournament.id
          ? { ...item, dayCount: dayCount - 1, updatedAt: now() }
          : item,
      ),
      tournamentScheduleItems: current.tournamentScheduleItems.map((item) =>
        item.tournamentId === tournament.id && item.dayNumber > dayNumber
          ? { ...item, dayNumber: item.dayNumber - 1, updatedAt: now() }
          : item,
      ),
    }));
  };

  return (
    <section className="wide-panel">
      <div className="panel-heading">
        <h2>Schedule</h2>
        <button
          className={isEditingSchedule ? "primary-button compact-button" : "ghost-button compact-button"}
          onClick={() => setIsEditingSchedule((current) => !current)}
        >
          {isEditingSchedule ? "Done" : "Edit"}
        </button>
      </div>
      {addingGameDay !== null ? (
        <form className="picker-create-row schedule-game-form" onSubmit={addGame}>
          <span className="form-context">Day {addingGameDay}</span>
          <input
            value={opponentName}
            onChange={(event) => setOpponentName(event.target.value)}
            placeholder="Opponent"
          />
          <input
            value={videoUrl}
            onChange={(event) => setVideoUrl(event.target.value)}
            placeholder="YouTube URL"
          />
          <button type="submit">Save</button>
          <button type="button" className="ghost-button" onClick={cancelAddGame}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="tournament-schedule">
          {days.map((dayNumber) => {
            const dayItems = scheduleItems.filter((item) => item.dayNumber === dayNumber);

            return (
              <section
                className={`schedule-day ${draggedItemId ? "is-drop-target" : ""}`}
                key={dayNumber}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggedItemId) {
                    moveScheduleItem(draggedItemId, dayNumber, dayItems.length);
                    setDraggedItemId(null);
                  }
                }}
              >
                <div className="schedule-day-heading">
                  <h3>Day {dayNumber}</h3>
                  {isEditingSchedule && (
                    <button
                      className="ghost-button compact-button"
                      disabled={dayItems.length > 0 || dayCount <= 1}
                      onClick={() => removeDay(dayNumber)}
                    >
                      Remove Day
                    </button>
                  )}
                </div>
                <div className="selection-list">
                  {dayItems.map((item, index) => {
                    const game = item.gameId
                      ? data.games.find((gameItem) => gameItem.id === item.gameId)
                      : null;

                    return (
                      <div
                        className={[
                          "selection-row",
                          "schedule-row",
                          item.type === "bye" ? "bye-row" : "",
                          isEditingSchedule ? "is-editing" : "",
                          draggedItemId === item.id ? "is-dragging" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        draggable
                        key={item.id}
                        onClick={() => {
                          if (game && !isEditingSchedule) {
                            navigate(paths.game(game.id));
                          }
                        }}
                        onKeyDown={(event) => {
                          if (
                            game &&
                            !isEditingSchedule &&
                            (event.key === "Enter" || event.key === " ")
                          ) {
                            event.preventDefault();
                            navigate(paths.game(game.id));
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        onDragStart={() => setDraggedItemId(item.id)}
                        onDragEnd={() => setDraggedItemId(null)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.stopPropagation();
                          if (draggedItemId) {
                            moveScheduleItem(draggedItemId, dayNumber, index);
                            setDraggedItemId(null);
                          }
                        }}
                      >
                        <span>
                          <strong>{game ? `vs ${game.opponentName}` : item.label ?? "Bye"}</strong>
                          <em>
                            {game
                              ? game.videoUrl
                                ? "YouTube linked"
                                : "No video URL"
                              : "Bye round"}
                          </em>
                        </span>
                        <b>{game ? `${game.ourScore}-${game.opponentScore}` : "Bye"}</b>
                        {isEditingSchedule && (
                          <button
                            className="schedule-remove-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeScheduleItem(item);
                            }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="schedule-actions">
                  <button onClick={() => setAddingGameDay(dayNumber)}>Add Game</button>
                  <button className="ghost-button" onClick={() => addBye(dayNumber)}>
                    Add Bye
                  </button>
                </div>
              </section>
            );
          })}
          <button className="ghost-button compact-button add-day-button" onClick={addDay}>
            Add Day
          </button>
        </div>
      )}
    </section>
  );
}

export default TournamentPage;
