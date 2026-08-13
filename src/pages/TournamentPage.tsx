import { Dispatch, FormEvent, SetStateAction, useState } from "react";
import {
  createTournamentBye,
  createTournamentGame,
  deleteTournamentDay,
  deleteTournamentScheduleItem,
  moveTournamentScheduleItem,
  selectRosteredTournamentPlayers,
  toggleTournamentPlayer as toggleApiTournamentPlayer,
  updateTournamentDayCount,
} from "../lib/api";
import { paths } from "../lib/routes";
import type { AppData, Id, Tournament, TournamentScheduleItem } from "../types";

type DataSetter = Dispatch<SetStateAction<AppData>>;

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
  const [error, setError] = useState("");

  const toggleTournamentPlayer = async (playerId: Id) => {
    setError("");
    try {
      const result = await toggleApiTournamentPlayer(tournament.id, playerId);
      setData(result.data);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to update tournament roster.");
    }
  };

  const selectRosteredPlayers = async () => {
    setError("");
    try {
      const result = await selectRosteredTournamentPlayers(tournament.id);
      setData(result.data);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to select rostered players.");
    }
  };

  return (
    <section className="wide-panel">
      {error && <p className="status-banner error">{error}</p>}
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
  const [error, setError] = useState("");

  const scheduleItems = data.tournamentScheduleItems
    .filter((item) => item.tournamentId === tournament.id)
    .sort((a, b) => a.dayNumber - b.dayNumber || a.sortOrder - b.sortOrder);
  const dayCount = Math.max(1, tournament.dayCount, ...scheduleItems.map((item) => item.dayNumber));
  const days = Array.from({ length: dayCount }, (_, index) => index + 1);

  const addGame = async (event: FormEvent) => {
    event.preventDefault();
    if (!opponentName.trim() || addingGameDay === null) return;

    setError("");
    try {
      const result = await createTournamentGame({
        tournamentId: tournament.id,
        opponentName: opponentName.trim(),
        videoUrl: videoUrl.trim(),
        dayNumber: addingGameDay,
      });
      setData(result.data);
      setOpponentName("");
      setVideoUrl("");
      setAddingGameDay(null);
      if (result.gameId) {
        navigate(paths.game(result.gameId));
      }
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to add game.");
    }
  };

  const cancelAddGame = () => {
    setOpponentName("");
    setVideoUrl("");
    setAddingGameDay(null);
  };

  const addBye = async (dayNumber: number) => {
    setError("");
    try {
      const result = await createTournamentBye(tournament.id, dayNumber);
      setData(result.data);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to add bye.");
    }
  };

  const addDay = async () => {
    setError("");
    try {
      const result = await updateTournamentDayCount(tournament.id, dayCount + 1);
      setData(result.data);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to add day.");
    }
  };

  const moveScheduleItem = async (draggedId: Id, targetDay: number, targetIndex: number) => {
    setError("");
    try {
      const result = await moveTournamentScheduleItem({
        tournamentId: tournament.id,
        scheduleItemId: draggedId,
        targetDay,
        targetIndex,
      });
      setData(result.data);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to move schedule item.");
    }
  };

  const removeScheduleItem = async (scheduleItem: TournamentScheduleItem) => {
    setError("");
    try {
      const result = await deleteTournamentScheduleItem(tournament.id, scheduleItem.id);
      setData(result.data);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to remove schedule item.");
    }
  };

  const removeDay = async (dayNumber: number) => {
    const dayItems = scheduleItems.filter((item) => item.dayNumber === dayNumber);
    if (dayItems.length > 0 || dayCount <= 1) return;

    setError("");
    try {
      const result = await deleteTournamentDay(tournament.id, dayNumber);
      setData(result.data);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to remove day.");
    }
  };

  return (
    <section className="wide-panel">
      {error && <p className="status-banner error">{error}</p>}
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
